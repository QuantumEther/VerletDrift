// Mission 21: native Chrono object/lifecycle probe. No tire/contact law overrides.
#include <cmath>
#include <iomanip>
#include <iostream>
#include <memory>
#include <string>
#include "chrono/physics/ChSystemSMC.h"
#include "chrono_vehicle/terrain/FlatTerrain.h"
#include "chrono_vehicle/wheeled_vehicle/ChSpindle.h"
#include "chrono_models/vehicle/generic/Generic_Wheel.h"
#include "chrono_models/vehicle/generic/tire/Generic_TMeasyTire.h"
using namespace chrono;
using namespace chrono::vehicle;
using namespace chrono::vehicle::generic;

// Expose diagnostics and access only. All lifecycle overrides remain upstream's.
struct ReadableTire : Generic_TMeasyTire {
    ReadableTire():Generic_TMeasyTire("mission21"){}
    ChVector2d Bristles()const{ChVector2d z;GetInternalStates(z);return z;}
    double Dz()const{return m_par.dz;}
    double ElasticNormal(double d)const{return GetNormalStiffnessForce(d);}
    double TrailM(){return -AlignmentTorque(1);}
    double Sy()const{return m_states.sy;}
    double PLength()const{return m_states.P_len;}
};
bool finite(const ChVector3d& v){return std::isfinite(v.x())&&std::isfinite(v.y())&&std::isfinite(v.z());}
void vec(const ChVector3d& v){std::cout<<','<<v.x()<<','<<v.y()<<','<<v.z();}
void probe(const std::string& id,double vx,double vy,double om,double configured_dt,double advance_dt,double vz_offset=0,bool zero_boundary=false){
    ChSystemSMC system;
    system.SetGravitationalAcceleration(ChVector3d(0,0,0));
    auto spindle=chrono_types::make_shared<ChSpindle>();
    spindle->SetMass(1);spindle->SetInertiaXX(ChVector3d(1,1,1));
    spindle->SetPos(ChVector3d(0,0,.449072));spindle->SetRot(QUNIT);
    system.AddBody(spindle);
    auto wheel=chrono_types::make_shared<Generic_Wheel>("native-wheel");
    wheel->Initialize(nullptr,spindle,LEFT,0);
    wheel->EnableCollision(false); // FlatTerrain uses actual tire disc query, no rigid-wheel collision.
    auto diagnostic=chrono_types::make_shared<ReadableTire>();
    std::shared_ptr<ChTire> tire=diagnostic;
    wheel->SetTire(tire);tire->Initialize(wheel);
    tire->SetCollisionType(ChTire::CollisionType::SINGLE_POINT);
    tire->SetStepsize(configured_dt);
    FlatTerrain road(0,.8f);
    spindle->SetPosDt(ChVector3d(vx,vy,0));spindle->SetAngVelParent(ChVector3d(0,om,0));
    double vz=0;
    if(zero_boundary){
        // Establish the actual collision depth through the native public lifecycle.
        // Read diagnostics, then prescribe a physical separation velocity. No state writes.
        tire->Synchronize(system.GetChTime(),road);
        double native_depth=diagnostic->ReportTireContactData().depth;
        vz=diagnostic->ElasticNormal(native_depth)/diagnostic->Dz()+vz_offset;
    }
    spindle->SetPosDt(ChVector3d(vx,vy,vz));
    ChCoordsys<> geometric_frame;double geometric_depth;float friction;
    bool geometric=ChTire::DiscTerrainCollision1pt(road,wheel->GetState().pos,ChVector3d(0,1,0),.4699,geometric_frame,geometric_depth,friction);
    spindle->EmptyTireAccumulator();
    tire->Synchronize(system.GetChTime(),road);
    wheel->Synchronize(); // Official rig order: apply cached wrench before Advance.
    auto first_force=spindle->GetAccumulatedForce(spindle->GetTireAccumulatorIndex());
    auto first_moment=spindle->TransformDirectionLocalToParent(spindle->GetAccumulatedTorque(spindle->GetTireAccumulatorIndex()));
    auto before=diagnostic->Bristles();
    tire->Advance(advance_dt);
    auto after=diagnostic->Bristles();
    const auto data=diagnostic->ReportTireContactData();
    ChCoordsys<> local_frame;
    auto local=tire->ReportTireForceLocal(&road,local_frame);
    auto hub=tire->ReportTireForce(&road);
    auto state=wheel->GetState();
    auto index=spindle->GetTireAccumulatorIndex();
    auto accf=spindle->GetAccumulatedForce(index);
    auto acct=spindle->TransformDirectionLocalToParent(spindle->GetAccumulatedTorque(index));
    double power=Vdot(hub.force,state.lin_vel)+Vdot(hub.moment,state.ang_vel);
    double applied_power=Vdot(accf,state.lin_vel)+Vdot(acct,state.ang_vel);
    double radius=tire->GetRadius(),sy=diagnostic->Sy(),patch=diagnostic->PLength(),trail=diagnostic->TrailM();
    bool safe=finite(first_force)&&finite(first_moment);
    double time_before=system.GetChTime();
    int integrated=0;
    if(safe){system.DoStepDynamics(advance_dt);integrated=1;}
    auto native_post_p=spindle->GetPos();auto native_post_v=spindle->GetPosDt();auto native_post_w=spindle->GetAngVelParent();
    // Next ordinary callback, with naturally advanced state, no pose/velocity reset.
    spindle->EmptyTireAccumulator();
    tire->Synchronize(system.GetChTime(),road);
    wheel->Synchronize();
    auto next_force=spindle->GetAccumulatedForce(index);
    auto next_moment=spindle->TransformDirectionLocalToParent(spindle->GetAccumulatedTorque(index));
    bool next_active=diagnostic->ReportTireContactData().in_contact;
    double next_normal=diagnostic->ReportTireContactData().normal_force;
    auto next_br=diagnostic->Bristles();
    auto next_point=diagnostic->ReportTireContactData().frame.pos;
    double next_power=Vdot(next_force,native_post_v)+Vdot(next_moment,native_post_w);
    std::cout<<id<<','<<geometric<<','<<data.in_contact<<','<<geometric_depth<<','<<data.depth<<','<<data.normal_force<<','<<vz<<','<<tire->GetStepsize()<<','<<advance_dt<<','<<time_before<<','<<system.GetChTime()<<','<<integrated<<','<<before.x()<<','<<before.y()<<','<<after.x()<<','<<after.y()<<','<<radius<<','<<.4699-data.depth<<','<<sy<<','<<patch<<','<<trail<<','<<power;
    vec(data.frame.pos);vec(data.vel);vec(local.force);vec(local.moment);vec(hub.point);vec(hub.force);vec(hub.moment);vec(accf);vec(acct);vec(state.pos);vec(state.lin_vel);vec(state.ang_vel);vec(native_post_v);vec(native_post_w);vec(next_force);vec(next_moment);vec(native_post_p);vec(next_point);
    std::cout<<','<<data.frame.rot.e0()<<','<<data.frame.rot.e1()<<','<<data.frame.rot.e2()<<','<<data.frame.rot.e3()<<','<<spindle->GetMass()<<','<<next_active<<','<<next_normal<<','<<next_br.x()<<','<<next_br.y()<<','<<applied_power<<','<<next_power<<','<<diagnostic->Dz()<<','<<diagnostic->ElasticNormal(data.depth)<<'\n';
}
int main(){
    std::cout<<std::setprecision(17);
    std::cout<<"id,geometric_contact,active_contact,geometric_depth_m,depth_m,Fn_N,vz_mps,configured_dt_s,advance_dt_s,time_before_s,time_after_s,integrated,brx_before_m,bry_before_m,brx_after_m,bry_after_m,Reff_m,Rstat_m,sy,patch_length_m,trail_m,pending_power_W";
    for(const auto& prefix:{"contact_point","contact_velocity","local_force","local_moment","hub_point","hub_force","hub_moment","acc_force","acc_moment","wheel_position","wheel_velocity","wheel_angvel","post_velocity","post_angvel","next_acc_force","next_acc_moment","post_position","next_contact_point"})
        for(const auto& axis:{"x","y","z"})std::cout<<','<<prefix<<'_'<<axis;
    std::cout<<",frame_qw,frame_qx,frame_qy,frame_qz,spindle_mass_kg,next_active_contact,next_normal_N,next_brx_m,next_bry_m,applied_power_W,next_applied_power_W,dz_Nsm,elastic_normal_N\n";
    probe("A_below",0,0,0,.001,.001,-1e-6,true);
    probe("A_zero",0,0,0,.001,.001,0,true);
    probe("A_above",0,0,0,.001,.001,1e-6,true);
    constexpr double R=.46295733333333333;
    probe("B_below",.999999,.1,.999999/R,.001,.001);
    probe("B_at",1,.1,1/R,.001,.001);
    probe("B_above",1.000001,.1,1.000001/R,.001,.001);
    probe("C_forward",10,.1,21.384260032601997,.001,.001);
    probe("C_reverse",-10,-.1,-21.384260032601997,.001,.001);
    probe("D_small_matched",.1,0,0,.001,.001);
    probe("D_large_matched",.1,0,0,.01,.01);
    probe("D_mismatched",.1,0,0,.001,.01);
}
