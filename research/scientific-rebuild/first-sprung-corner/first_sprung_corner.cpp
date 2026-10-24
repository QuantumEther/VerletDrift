// Mission 23: isolated native Chrono sprung-corner experiment.
// The only altered upstream implementation is the separately built Mission 22
// zero-load TMeasy research patch. Vehicle geometry, torque, and brake inputs
// are fixtures; all body coordinates and wheel spin are integrated by Chrono.
#include <algorithm>
#include <chrono>
#include <cmath>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <limits>
#include <memory>
#include <string>
#include <vector>

#include "chrono/physics/ChBody.h"
#include "chrono/physics/ChLinkLock.h"
#include "chrono/physics/ChLinkTSDA.h"
#include "chrono/physics/ChSystemSMC.h"
#include "chrono/solver/ChIterativeSolverLS.h"
#include "chrono_vehicle/terrain/FlatTerrain.h"
#include "chrono_vehicle/wheeled_vehicle/ChSpindle.h"
#include "chrono_models/vehicle/generic/Generic_Wheel.h"
#include "chrono_models/vehicle/generic/tire/Generic_TMeasyTire.h"

using namespace chrono;
using namespace chrono::vehicle;
using namespace chrono::vehicle::generic;

namespace {
constexpr double g = 9.81;
constexpr double ms = 280.0;
constexpr double mc = 12.0;
constexpr double k = 30000.0;
constexpr double c = 2000.0;
constexpr double h_default = 0.001;
constexpr double wheel_radius_guess = 0.4699;

struct ReadableTire : Generic_TMeasyTire {
    ReadableTire() : Generic_TMeasyTire("mission23-generic-tmeasy") {}
    ChVector2d Bristles() const { ChVector2d value; GetInternalStates(value); return value; }
    double Dz() const { return m_par.dz; }
    double ElasticNormal(double depth) const { return GetNormalStiffnessForce(depth); }
    double DampingNormal(double depth, double velocity) const { return GetNormalDampingForce(depth, velocity); }
    double RollingRadius() const { return m_states.R_eff; }
    double Sy() const { return m_states.sy; }
    double Sx() const { return m_states.sx; }
    void InitNative(const std::shared_ptr<ChWheel>& w) { Initialize(w); }
    void SyncNative(double t, const ChTerrain& terrain) { Synchronize(t, terrain); }
    void AdvanceNative(double step) { Advance(step); }
};

struct CaseSpec {
    std::string name;
    double h = h_default;
    double duration = 1.0;
    bool use_tire = true;
    bool settle = false;
    bool disturbance = false;
    bool unload = false;
    double drive = 0;
    double brake = 0;
    double initial_wheel_omega = 0;
    double initial_body_dz = 0;
    bool boundary_fixture = false;
    bool zero_gravity = false;
    int warmup_steps = 0;
};

struct Assembly {
    ChSystemSMC system;
    std::shared_ptr<ChBody> ground;
    std::shared_ptr<ChBody> sprung;
    std::shared_ptr<ChBody> carrier;
    std::shared_ptr<ChSpindle> spindle;
    std::shared_ptr<ChLinkLockPrismatic> body_guide;
    std::shared_ptr<ChLinkLockPrismatic> carrier_guide;
    std::shared_ptr<ChLinkLockRevolute> wheel_revolute;
    std::shared_ptr<ChLinkTSDA> suspension;
    std::shared_ptr<Generic_Wheel> wheel;
    std::shared_ptr<ReadableTire> tire;
    FlatTerrain road{0, 0.8f};
    unsigned int fixture_accum = 0;
    double mass_wheel_tire = 0;
    ChVector3d inertia_wheel_tire{0,0,0};
    double gravity = g;
    double static_depth = 0;
};

double tire_depth_for_load(const ReadableTire& tire, double load) {
    double lo = 0.0, hi = 0.15;
    for (int i = 0; i < 64; ++i) {
        const double mid = 0.5 * (lo + hi);
        if (tire.ElasticNormal(mid) < load) lo = mid; else hi = mid;
    }
    if (hi-lo > 1e-10 || !std::isfinite(tire.ElasticNormal(hi)) ||
        std::abs(tire.ElasticNormal(hi)-load) > std::max(1e-6,load*1e-9))
        throw std::runtime_error("bounded tire static-depth solve failed");
    return 0.5 * (lo+hi);
}

std::shared_ptr<ChLinkLockPrismatic> add_prismatic(ChSystemSMC& sys,
        const std::shared_ptr<ChBody>& a, const std::shared_ptr<ChBody>& b,
        const ChVector3d& pos, const ChQuaternion<>& rot, const std::string& name) {
    auto link = chrono_types::make_shared<ChLinkLockPrismatic>();
    link->SetName(name);
    link->Initialize(a, b, ChFrame<>(pos, rot));
    sys.AddLink(link);
    return link;
}

Assembly build(double h, bool tire_enabled, double initial_omega, double body_dz, bool zero_gravity=false) {
    Assembly a;
    a.gravity = zero_gravity ? 0.0 : g;
    a.system.SetGravitationalAcceleration({0,0,-a.gravity});
    a.system.SetTimestepperType(ChTimestepper::Type::EULER_IMPLICIT_LINEARIZED);
    auto solver = chrono_types::make_shared<ChSolverMINRES>();
    solver->SetMaxIterations(50);
    solver->SetTolerance(1e-10);
    a.system.SetSolver(solver);

    a.ground = chrono_types::make_shared<ChBody>();
    a.ground->SetName("fixed-guide-fixture");
    a.ground->SetFixed(true);
    a.system.AddBody(a.ground);

    const double tire_mass = 37.6;
    const double wheel_mass = 18.0;
    const double total_unsprung_mass = mc + tire_mass + wheel_mass;
    const double target_normal = (ms + total_unsprung_mass) * g;

    a.sprung = chrono_types::make_shared<ChBody>();
    a.sprung->SetName("sprung-quarter-body");
    a.sprung->SetMass(ms);
    a.sprung->SetInertiaXX({80,80,80});
    a.sprung->SetPos({0,0,1.2});
    a.system.AddBody(a.sprung);
    a.body_guide = add_prismatic(a.system, a.sprung, a.ground, {0,0,a.sprung->GetPos().z()}, QUNIT, "body-vertical-guide");

    // Wheel/spindle is constructed with finite staging inertia because Chrono
    // immediately inverts SetInertiaXX. The source wheel and tire initialize it.
    a.spindle = chrono_types::make_shared<ChSpindle>();
    a.spindle->SetName("wheel-spindle");
    a.spindle->SetMass(1.0);
    a.spindle->SetInertiaXX({1,1,1});
    a.spindle->SetPos({0,0,wheel_radius_guess});
    a.spindle->SetRot(QUNIT);
    a.system.AddBody(a.spindle);
    a.wheel = chrono_types::make_shared<Generic_Wheel>("source-generic-wheel");
    a.wheel->Initialize(nullptr, a.spindle, LEFT, 0);
    a.wheel->EnableCollision(false);
    a.tire = chrono_types::make_shared<ReadableTire>();
    a.wheel->SetTire(a.tire);
    std::shared_ptr<ChTire> base_tire = a.tire;
    a.tire->InitNative(a.wheel);
    a.tire->SetCollisionType(ChTire::CollisionType::SINGLE_POINT);
    a.tire->SetStepsize(h);
    // Remove finite constructor staging values. The source wheel/tire component
    // registry owns mass exactly once on the native spindle.
    a.spindle->SetMass(wheel_mass + tire_mass);
    a.spindle->SetInertiaXX(ChVector3d(0.4634+3.84, 0.6243+6.69, 0.4634+3.84));
    a.mass_wheel_tire = a.spindle->GetMass();
    a.inertia_wheel_tire = a.spindle->GetInertiaXX();
    if (std::abs(a.mass_wheel_tire - 55.6) > 1e-12 || a.spindle->GetInertiaXX().x() <= 0)
        throw std::runtime_error("wheel/tire component mass registry mismatch");
    a.spindle->SetAngVelParent({0,initial_omega,0});

    a.carrier = chrono_types::make_shared<ChBody>();
    a.carrier->SetName("unsprung-carrier");
    a.carrier->SetMass(mc);
    a.carrier->SetInertiaXX({0.2,0.2,0.2});
    a.carrier->SetPos({0,0,wheel_radius_guess});
    a.carrier->SetRot(QUNIT);
    a.system.AddBody(a.carrier);
    a.carrier_guide = add_prismatic(a.system, a.carrier, a.sprung, a.carrier->GetPos(), QUNIT, "suspension-heave-guide");
    const auto axle_rot = QuatFromAngleX(-CH_PI_2);  // local +Z axis maps to world +Y
    a.wheel_revolute = chrono_types::make_shared<ChLinkLockRevolute>();
    a.wheel_revolute->SetName("wheel-relative-spin-joint");
    a.wheel_revolute->Initialize(a.spindle, a.carrier, ChFrame<>(a.spindle->GetPos(), axle_rot));
    a.wheel_revolute->ForceRz().SetActive(true);
    a.system.AddLink(a.wheel_revolute);

    const double static_depth = tire_depth_for_load(*a.tire, target_normal);
    a.static_depth = static_depth;
    const double wheel_z = a.tire->GetRadius() - static_depth;
    a.spindle->SetPos({0,0,wheel_z});
    a.carrier->SetPos({0,0,wheel_z});
    // Reset the joint frames to the actual initial wheel/carrier center.
    a.carrier_guide->Initialize(a.carrier, a.sprung, ChFrame<>(a.carrier->GetPos(),QUNIT));
    a.wheel_revolute->Initialize(a.spindle, a.carrier, ChFrame<>(a.spindle->GetPos(), axle_rot));

    // The TSDA endpoints are on the sprung body and carrier, both on the centerline.
    // Compression equals sprung static load / k; the initial extension is solved
    // from actual anchor positions, so no ride-height force is imposed externally.
    const ChVector3d sprung_anchor = a.sprung->TransformPointLocalToParent({0,0,-0.3});
    const ChVector3d carrier_anchor = a.carrier->GetPos();
    const double spring_len = (sprung_anchor-carrier_anchor).Length();
    const double spring_compression = zero_gravity ? 0.0 : ms*g/k;
    a.suspension = chrono_types::make_shared<ChLinkTSDA>();
    a.suspension->SetName("linear-suspension-spring-damper");
    a.suspension->Initialize(a.sprung, a.carrier, true, {0,0,-0.3}, {0,0,0});
    a.suspension->SetSpringCoefficient(k);
    a.suspension->SetDampingCoefficient(c);
    a.suspension->SetRestLength(spring_len + spring_compression);
    a.system.AddLink(a.suspension);

    a.fixture_accum = a.sprung->AddAccumulator();
    if (body_dz != 0) a.sprung->SetPos({0,0,1.2+body_dz});
    if (!tire_enabled) a.tire->SetCollisionType(ChTire::CollisionType::SINGLE_POINT);
    return a;
}

bool finite_vec(const ChVector3d& v) { return std::isfinite(v.x()) && std::isfinite(v.y()) && std::isfinite(v.z()); }

double kinetic(const std::shared_ptr<ChBody>& b) {
    const auto v=b->GetPosDt(), w=b->GetAngVelLocal(), I=b->GetInertiaXX();
    return 0.5*b->GetMass()*Vdot(v,v)+0.5*(I.x()*w.x()*w.x()+I.y()*w.y()*w.y()+I.z()*w.z()*w.z());
}

double potential(const Assembly& a) {
    const double z=a.sprung->GetPos().z(), zc=a.carrier->GetPos().z(), zw=a.spindle->GetPos().z();
    const double grav=a.gravity*(ms*z+mc*zc+a.mass_wheel_tire*zw);
    const double d=a.suspension->GetDeformation();
    return grav+0.5*k*d*d;
}

void print_header(std::ofstream& f) {
    f << "case,force_evaluation_time_s,time_s,h_s,body_z_m,body_vz_m_s,carrier_z_m,carrier_vz_m_s,wheel_x_m,wheel_z_m,wheel_vx_m_s,wheel_vz_m_s,wheel_abs_omega_y_rad_s,carrier_omega_y_rad_s,relative_omega_rad_s,spin_rpm,depth_m,geometric_contact,contact_active,normal_raw_N,normal_N,contact_point_x_m,contact_point_y_m,contact_point_z_m,hub_x_m,hub_y_m,hub_z_m,Fx_N,Fy_N,Fz_N,Mx_hub_Nm,My_hub_Nm,Mz_hub_Nm,Mx_hub_calc_Nm,My_hub_calc_Nm,Mz_hub_calc_Nm,Fx_local_N,Fy_local_N,Fz_local_N,Mx_contact_Nm,My_contact_Nm,Mz_contact_Nm,sx,sy,brx_m,bry_m,spring_deflection_m,spring_rate_m_s,spring_damper_force_N,damper_power_W,drive_requested_Nm,brake_requested_Nm,brake_applied_Nm,shaft_port_torque_Nm,drive_power_W,brake_power_W,contact_power_W,fixture_power_W,kinetic_J,potential_gravity_spring_J,mechanical_energy_residual_J,drive_work_J,brake_work_J,damper_work_J,contact_work_J,fixture_work_J,body_guide_reaction_x_N,body_guide_reaction_z_N,body_guide_reaction_torque_y_Nm,carrier_guide_reaction_x_N,carrier_guide_reaction_z_N,carrier_guide_reaction_torque_y_Nm,spin_joint_reaction_axis_Nm,tire_update_us,native_mechanical_us,total_step_us,solver_iterations,solver_error,solver_status,finite\n";
}

void run(const CaseSpec& spec, const std::string& out) {
    Assembly a=build(spec.h,spec.use_tire,spec.initial_wheel_omega,spec.initial_body_dz,spec.zero_gravity);
    if (spec.boundary_fixture) {
        // Explicit controlled tire-history fixture: establish finite bristle
        // memory at positive support with a prescribed initial spin, then set
        // the vertical velocity to the analytically calculated Fn=0 boundary.
        a.tire->SyncNative(a.system.GetChTime(),a.road);
        a.tire->AdvanceNative(spec.h);
        const double live_depth=a.tire->ReportTireContactData().depth;
        double vz=a.tire->ElasticNormal(live_depth)/a.tire->Dz();
        a.sprung->SetPosDt({0,0,vz});
        a.carrier->SetPosDt({0,0,vz});
        a.spindle->SetPosDt({0,0,vz});
        // The published comparison is evaluated in floating point. Search a
        // small, bounded neighborhood of the analytical root for a representable
        // velocity that evaluates the exact native expression to Fn == 0.
        // This changes only the fixture initial condition, not tire equations.
        bool exact_boundary=false;
        bool found_negative=false;
        double best_negative_abs=std::numeric_limits<double>::infinity();
        double negative_vz=vz;
        for (int n=0;n<256 && !exact_boundary;n++) {
            const int direction=(n%2==0)?1:-1;
            const int count=n/2+1;
            double candidate=vz;
            for(int j=0;j<count;j++) candidate=std::nextafter(candidate,direction>0?std::numeric_limits<double>::infinity():-std::numeric_limits<double>::infinity());
            a.sprung->SetPosDt({0,0,candidate});
            a.carrier->SetPosDt({0,0,candidate});
            a.spindle->SetPosDt({0,0,candidate});
            a.tire->SyncNative(a.system.GetChTime(),a.road);
            const auto diagnostic=a.tire->ReportTireContactData();
            const double raw=a.tire->ElasticNormal(diagnostic.depth)+a.tire->DampingNormal(diagnostic.depth,-diagnostic.vel.z());
            if(raw==0.0) { vz=candidate; exact_boundary=true; }
            else if(raw<0.0 && -raw<best_negative_abs) { found_negative=true;best_negative_abs=-raw;negative_vz=candidate; }
        }
        if(!exact_boundary) {
            if(!found_negative || best_negative_abs>1e-8) throw std::runtime_error("could not represent zero-load boundary within floating-point tolerance");
            vz=negative_vz;
            a.sprung->SetPosDt({0,0,vz});
            a.carrier->SetPosDt({0,0,vz});
            a.spindle->SetPosDt({0,0,vz});
            a.tire->SyncNative(a.system.GetChTime(),a.road);
        }
    }
    if (spec.settle) {
        const int n=static_cast<int>(std::ceil(6.0/spec.h));
        for(int i=0;i<n;i++) {
            a.spindle->EmptyAccumulator(a.spindle->GetTireAccumulatorIndex());
            a.tire->SetStepsize(spec.h);
            a.tire->SyncNative(a.system.GetChTime(),a.road);
            a.tire->AdvanceNative(spec.h);
            a.wheel->Synchronize();
            a.system.ForceUpdate();
            if(a.system.DoStepDynamics(spec.h)==0) throw std::runtime_error("native solver rejected a static-settle step");
        }
    }
    for (int i=0;i<spec.warmup_steps;i++) {
        a.spindle->EmptyAccumulator(a.spindle->GetTireAccumulatorIndex());
        a.tire->SetStepsize(spec.h);
        a.tire->SyncNative(a.system.GetChTime(),a.road);
        a.tire->AdvanceNative(spec.h);
        a.wheel->Synchronize();
        a.system.ForceUpdate();
        if(a.system.DoStepDynamics(spec.h)==0) throw std::runtime_error("native solver rejected a warmup step");
    }
    {
        std::ofstream meta(out+".meta.json");
        const double eps=1e-6;
        const double kt=(a.tire->ElasticNormal(a.static_depth+eps)-a.tire->ElasticNormal(a.static_depth-eps))/(2*eps);
        meta<<std::setprecision(17)<<"{\n"
            <<"  \"experiment_id\": \"M23-CORNER-001\",\n"
            <<"  \"case\": \""<<spec.name<<"\",\n"
            <<"  \"chrono_commit\": \"9a5072b5324e012a66d9fb7eaac0c679b8465e73\",\n"
            <<"  \"mission22_patch_sha256\": \"2f67a210a741588d10ff0a1c548d29daf5889a488bc4e5a2fef64d8c05a86610\",\n"
            <<"  \"master_step_s\": "<<spec.h<<",\n"
            <<"  \"sprung_mass_kg\": "<<a.sprung->GetMass()<<",\n"
            <<"  \"carrier_mass_kg\": "<<a.carrier->GetMass()<<",\n"
            <<"  \"wheel_tire_mass_kg\": "<<a.spindle->GetMass()<<",\n"
            <<"  \"wheel_tire_inertia_kg_m2\": ["<<a.spindle->GetInertiaXX().x()<<","<<a.spindle->GetInertiaXX().y()<<","<<a.spindle->GetInertiaXX().z()<<"],\n"
            <<"  \"target_static_normal_N\": "<<(ms+mc+a.spindle->GetMass())*g<<",\n"
            <<"  \"initial_static_depth_m\": "<<a.static_depth<<",\n"
            <<"  \"local_tire_vertical_stiffness_N_m\": "<<kt<<",\n"
            <<"  \"tire_vertical_damping_N_s_m\": "<<a.tire->Dz()<<",\n"
            <<"  \"spring_rate_N_m\": "<<k<<",\n"
            <<"  \"suspension_damping_N_s_m\": "<<c<<",\n"
            <<"  \"wheel_tire_axle_inertia_kg_m2\": "<<a.spindle->GetInertiaXX().y()<<",\n"
            <<"  \"solver\": \"MINRES max 50 iterations, tolerance 1e-10\",\n"
            <<"  \"tire_update_order\": \"Synchronize, Advance(h), Wheel::Synchronize, ForceUpdate, DoStepDynamics(h)\",\n"
            <<"  \"warmup_steps\": "<<spec.warmup_steps<<"\n}\n";
    }
    std::ofstream csv(out);
    if(!csv) throw std::runtime_error("cannot open output trace: "+out);
    csv<<std::setprecision(17); print_header(csv);
    double drive_work=0,brake_work=0,contact_work=0,fixture_work=0,damper_work=0;
    const double initial_energy=kinetic(a.sprung)+kinetic(a.carrier)+kinetic(a.spindle)+potential(a);
    const int n=static_cast<int>(std::ceil(spec.duration/spec.h));
    for(int i=0;i<n;i++) {
        const auto t0=std::chrono::steady_clock::now();
        const double t=a.system.GetChTime();
        const auto state=a.wheel->GetState();
        const double rel=state.ang_vel.y()-a.carrier->GetAngVelParent().y();
        const double drive_req=(t>=0.05 && t<0.25)?spec.drive:0.0;
        const double brake_req=(t>=0.05 && t<0.15)?spec.brake:0.0;
        const double brake_applied=(std::abs(rel)>1e-10)?-std::copysign(std::min(std::abs(brake_req),2000.0),rel):0.0;

        // Frozen body state -> tire sync/update -> one wrench -> shaft pairs -> native step.
        a.spindle->EmptyAccumulator(a.spindle->GetTireAccumulatorIndex());
        double tire_us=0;
        if(spec.use_tire) {
            a.tire->SetStepsize(spec.h);
            if(std::abs(a.tire->GetStepsize()-spec.h)>1e-15) throw std::runtime_error("tire/master timestep mismatch");
            const auto tire_start=std::chrono::steady_clock::now();
            a.tire->SyncNative(t,a.road);
            a.tire->AdvanceNative(spec.h);
            a.wheel->Synchronize();
            tire_us=std::chrono::duration<double,std::micro>(std::chrono::steady_clock::now()-tire_start).count();
        }
        a.sprung->EmptyAccumulator(a.fixture_accum);
        // The free revolute coordinate owns the shaft torque and its equal/opposite
        // housing reaction. This avoids splitting the physical port across ad hoc
        // body loads and lets the native joint evaluate it at its solver time level.
        a.wheel_revolute->ForceRz().SetActuatorForceTorque(drive_req+brake_applied);
        double fixture_power=0;
        double fixture_force=0;
        if(spec.unload && t<0.015) {
            // A bounded external lift fixture is logged as fixture work.
            a.sprung->AccumulateForce(a.fixture_accum,{0,0,50000},{0,0,a.sprung->GetPos().z()},false);
            fixture_force=50000;
            fixture_power=50000*a.sprung->GetPosDt().z();
        }
        const auto contact=a.tire->ReportTireContactData();
        const auto wrench=a.tire->ReportTireForce(&a.road);
        ChCoordsys<> tire_frame;
        const auto local_wrench=a.tire->ReportTireForceLocal(&a.road,tire_frame);
        const double contact_power=Vdot(wrench.force,state.lin_vel)+Vdot(wrench.moment,state.ang_vel);
        const double drive_power=drive_req*rel;
        const double brake_power=brake_applied*rel;
        const double spring_deformation=a.suspension->GetDeformation();
        const double spring_rate=a.suspension->GetVelocity();
        const double damper_power=-c*spring_rate*spring_rate;
        const double spring_rate_before=spring_rate;
        const double sprung_vz_before=a.sprung->GetPosDt().z();
        const auto native_start=std::chrono::steady_clock::now();
        // ChSystem caches body/link force updates between calls. The tire and
        // torque-port inputs above changed those loads, so invalidate that cache
        // before the fixed step; otherwise force elements can be consumed one
        // integration step late.
        a.system.ForceUpdate();
        const int system_step_result=a.system.DoStepDynamics(spec.h);
        const auto t1=std::chrono::steady_clock::now();
        const double native_us=std::chrono::duration<double,std::micro>(t1-native_start).count();
        const auto next=a.wheel->GetState();
        const double rel_next=next.ang_vel.y()-a.carrier->GetAngVelParent().y();
        drive_work+=drive_req*0.5*(rel+rel_next)*spec.h;
        brake_work+=brake_applied*0.5*(rel+rel_next)*spec.h;
        const double spring_rate_after=a.suspension->GetVelocity();
        damper_work+=-c*0.5*(spring_rate_before*spring_rate_before+spring_rate_after*spring_rate_after)*spec.h;
        contact_work+=(Vdot(wrench.force,0.5*(state.lin_vel+next.lin_vel))+
                       Vdot(wrench.moment,0.5*(state.ang_vel+next.ang_vel)))*spec.h;
        fixture_work+=fixture_force*0.5*(sprung_vz_before+a.sprung->GetPosDt().z())*spec.h;
        const double W0=drive_work+brake_work+contact_work+fixture_work+damper_work;
        const double E1=kinetic(a.sprung)+kinetic(a.carrier)+kinetic(a.spindle)+potential(a);
        const auto br=a.tire->Bristles();
        const auto body_reaction=a.body_guide->GetReaction1();
        const auto carrier_reaction=a.carrier_guide->GetReaction1();
        const auto spin_reaction=a.wheel_revolute->GetReaction1();
        const double solve_ms=std::chrono::duration<double,std::milli>(t1-t0).count();
        auto iter_solver=std::dynamic_pointer_cast<ChIterativeSolver>(a.system.GetSolver());
        const int iterations=iter_solver?iter_solver->GetIterations():0;
        const double solver_error=std::dynamic_pointer_cast<ChIterativeSolverLS>(a.system.GetSolver())?std::dynamic_pointer_cast<ChIterativeSolverLS>(a.system.GetSolver())->GetError():0;
        const bool finite_state=finite_vec(a.sprung->GetPos())&&finite_vec(a.sprung->GetPosDt())&&finite_vec(a.carrier->GetPos())&&finite_vec(a.carrier->GetPosDt())&&finite_vec(next.lin_vel)&&finite_vec(next.ang_vel)&&std::isfinite(br.x())&&std::isfinite(br.y())&&std::isfinite(E1)&&std::isfinite(contact.normal_force);
        const bool ok=system_step_result!=0&&finite_state&&iterations<=50&&solver_error<=1e-10;
        const double total_us=std::chrono::duration<double,std::micro>(t1-t0).count();
        const double energy_residual=E1-initial_energy-W0;
        const double raw_normal=contact.depth>0?a.tire->ElasticNormal(contact.depth)+a.tire->DampingNormal(contact.depth,-contact.vel.z()):0.0;
        const auto world_force=tire_frame.rot.Rotate(local_wrench.force);
        const auto world_moment_contact=tire_frame.rot.Rotate(local_wrench.moment);
        const auto reconstructed_moment=world_moment_contact+Vcross(contact.frame.pos-state.pos,world_force);
        const double shaft_port_torque=drive_req+brake_applied;
        csv<<spec.name<<','<<t<<','<<a.system.GetChTime()<<','<<spec.h<<','
           <<a.sprung->GetPos().z()<<','<<a.sprung->GetPosDt().z()<<','<<a.carrier->GetPos().z()<<','<<a.carrier->GetPosDt().z()<<','
           <<next.pos.x()<<','<<next.pos.z()<<','<<next.lin_vel.x()<<','<<next.lin_vel.z()<<','<<next.ang_vel.y()<<','<<a.carrier->GetAngVelParent().y()<<','<<rel_next<<','<<rel_next*60/(2*CH_PI)<<','
           <<contact.depth<<','<<(contact.depth>0)<<','<<contact.in_contact<<','<<raw_normal<<','<<contact.normal_force<<','
           <<contact.frame.pos.x()<<','<<contact.frame.pos.y()<<','<<contact.frame.pos.z()<<','<<state.pos.x()<<','<<state.pos.y()<<','<<state.pos.z()<<','
           <<wrench.force.x()<<','<<wrench.force.y()<<','<<wrench.force.z()<<','<<wrench.moment.x()<<','<<wrench.moment.y()<<','<<wrench.moment.z()<<','<<reconstructed_moment.x()<<','<<reconstructed_moment.y()<<','<<reconstructed_moment.z()<<','
           <<local_wrench.force.x()<<','<<local_wrench.force.y()<<','<<local_wrench.force.z()<<','<<local_wrench.moment.x()<<','<<local_wrench.moment.y()<<','<<local_wrench.moment.z()<<','
           <<a.tire->Sx()<<','<<a.tire->Sy()<<','<<br.x()<<','<<br.y()<<','<<spring_deformation<<','<<spring_rate<<','<<a.suspension->GetForce()<<','<<damper_power<<','
           <<drive_req<<','<<brake_req<<','<<brake_applied<<','<<shaft_port_torque<<','<<drive_power<<','<<brake_power<<','<<contact_power<<','<<fixture_power<<','
           <<E1<<','<<potential(a)<<','<<energy_residual<<','<<drive_work<<','<<brake_work<<','<<damper_work<<','<<contact_work<<','<<fixture_work<<','
           <<body_reaction.force.x()<<','<<body_reaction.force.z()<<','<<body_reaction.torque.y()<<','<<carrier_reaction.force.x()<<','<<carrier_reaction.force.z()<<','<<carrier_reaction.torque.y()<<','<<spin_reaction.torque.z()<<','
           <<tire_us<<','<<native_us<<','<<total_us<<','<<iterations<<','<<solver_error<<','<<(system_step_result!=0?"accepted":"rejected")<<','<<ok<<'\n';
        if(!ok) throw std::runtime_error("nonfinite state or diagnostic at t="+std::to_string(a.system.GetChTime()));
    }
}
} // namespace

int main(int argc,char**argv) {
    try {
        if(argc<3) { std::cerr<<"usage: corner CASE OUTPUT.csv [STEP_S]\n"; return 2; }
        CaseSpec s; s.name=argv[1];
        if(argc>3) s.h=std::stod(argv[3]);
        if(s.name=="static") {s.duration=8;s.settle=true;}
        else if(s.name=="disturbance") {s.duration=3;s.disturbance=true;s.initial_body_dz=0.02;}
        else if(s.name=="spin") {s.duration=.3;s.use_tire=false;s.zero_gravity=true;s.initial_wheel_omega=0;s.drive=150;}
        else if(s.name=="drive") {s.duration=.8;s.drive=250;}
        else if(s.name=="brake") {s.duration=.3;s.use_tire=false;s.zero_gravity=true;s.initial_wheel_omega=30;s.brake=200;}
        else if(s.name=="brake_high") {s.duration=.3;s.use_tire=false;s.zero_gravity=true;s.initial_wheel_omega=30;s.brake=1000;}
        else if(s.name=="unload") {s.duration=3.0;s.unload=true;}
        else if(s.name=="refine") {s.duration=.5;s.drive=150;}
        else if(s.name=="boundary") {s.duration=.05;s.boundary_fixture=true;s.initial_wheel_omega=5;}
        else if(s.name=="bench") {s.duration=5;s.drive=250;s.warmup_steps=1000;}
        else { std::cerr<<"unknown case\n";return 2; }
        run(s,argv[2]);
        return 0;
    } catch(const std::exception& e) { std::cerr<<"FAIL: "<<e.what()<<'\n'; return 1; }
}
