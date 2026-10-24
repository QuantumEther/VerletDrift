// Prescribed-contact adapter only. Constitutive definitions are extracted unchanged
// from hash-checked Project Chrono files (see upstream/LICENSE and manifest).
#include <algorithm>
#include <cmath>
#include <iostream>
#include <iomanip>
#include <memory>
#include <string>
#include <stdexcept>
#include <chrono>
#include <vector>
#include <cstdlib>
#include <new>
#include <limits>
static size_t allocations=0;
void* operator new(std::size_t n){++allocations;if(void* p=std::malloc(n))return p;throw std::bad_alloc();}
void operator delete(void* p)noexcept{std::free(p);}
void operator delete(void* p,std::size_t)noexcept{std::free(p);}
constexpr double CH_1_3=1.0/3.0, CH_2PI=6.283185307179586476925286766559;
struct ChVector3d {
    double a=0,b=0,c=0;
    ChVector3d()=default;
    ChVector3d(double x,double y,double z):a(x),b(y),c(z){}
    double x()const{return a;} double y()const{return b;} double z()const{return c;}
};
ChVector3d operator*(double k,ChVector3d v){return {k*v.a,k*v.b,k*v.c};}
struct ChVector2d {
    double a=0,b=0;
    double& x(){return a;} double& y(){return b;}
    double Length()const{return std::sqrt(a*a+b*b);}
    void Normalize(){double n=Length();if(n<std::numeric_limits<double>::min()){a=1;b=0;return;}double inv=1/n;a*=inv;b*=inv;}
    void operator*=(double k){a*=k;b*=k;}
};
// Identity contact frame; upright wheel, ISO x forward / y left / z up.
struct Rotation {ChVector3d GetAxisY()const{return {0,1,0};}};
template<class T=double> struct ChMatrix33 {ChMatrix33(Rotation){} ChVector3d GetAxisY()const{return {0,1,0};}};
struct Frame {ChVector3d TransformDirectionParentToLocal(ChVector3d v)const{return v;}};
struct WheelState {ChVector3d pos,lin_vel;Rotation rot;double omega=0;};
struct Wheel {WheelState state;WheelState GetState()const{return state;}};
struct ChTerrain {bool contact=true;double depth=.01;float mu=.8f;};
struct TerrainForce {ChVector3d force,point,moment;};
struct Data {bool in_contact=false;Frame frame;double depth=0,normal_force=0;ChVector3d vel;};
template<class T> T ChClamp(T x,T lo,T hi){if(x<lo)return lo;if(x>hi)return hi;return x;}
template<class T> void ChClampValue(T& x,T lo,T hi){x=ChClamp(x,lo,hi);}
bool DiscTerrainCollision(int,const ChTerrain& t,ChVector3d,ChVector3d,double,double,int,Frame&,double& d,float& mu){d=t.depth;mu=t.mu;return t.contact;}
struct ChFunctionSineStep {static double Eval(double,double,double,double,double);};
struct ChForceElementTire {explicit ChForceElementTire(const std::string&){};double m_stepsize=.001;};
struct ChTMeasyTire:ChForceElementTire {
    explicit ChTMeasyTire(const std::string&);
    #include "declarations.inc"
    TMeasyCoeff m_par{};TireStates m_states{};
    std::shared_ptr<Wheel> m_wheel=std::make_shared<Wheel>();
    Data m_data;TerrainForce m_tireforce;
    int m_collision_type=0,m_areaDep=0;
    double m_vnum,m_begin_start_transition,m_end_start_transition;
    bool m_use_startup_transition;
    double m_vcoulomb,m_frblend_begin,m_frblend_end,m_bottom_radius,m_bottom_stiffness,m_rolling_resistance;
    double m_unloaded_radius=0,m_width=0,m_rim_radius=0,m_d1=0,m_d2=0,m_time=0;
    const bool m_use_bdf1=false;
    void CalculateKinematics(WheelState,Frame){} // Only camber is consumed below; exactly zero in this adapter.
    double GetCamberAngle()const{return 0;}
    double GetTireMass()const{return 37.6;} // Generic_TMeasyTire::m_mass, pinned source.
    void SetVerticalStiffness(double Cz){m_d1=Cz;m_d2=0;} // Original header inline setter.
    void SetRollingResistanceCoefficient(double c){m_rolling_resistance=c;}
    void GuessTruck80Par(double,double,double,double,double=1,double=1,double=.5);
    void Synchronize(double,const ChTerrain&);
    void Advance(double);
    void CombinedCoulombForces(double&,double&,double,double);
    void tmxy_combined(double&,double&,double,double,double,double,double,double);
    double AlignmentTorque(double);
    double GetNormalStiffnessForce(double)const;
    double GetNormalDampingForce(double,double)const;
};
#include "definitions.inc"
struct Generic_TMeasyTire:ChTMeasyTire {
    Generic_TMeasyTire():ChTMeasyTire("generic"){
        SetTMeasyParams();
        // Original Initialize's bottoming defaults. No wheel-body/inertia mutation.
        m_bottom_radius=m_rim_radius+.01;m_bottom_stiffness=5*m_d1;
        m_states.vta=m_vnum;m_states.R_eff=m_unloaded_radius;
    }
    void SetTMeasyParams();
};
#include "fixture.inc"
void input(Generic_TMeasyTire& t,double vx,double vy,double om,double depth,double vz=0,bool contact=true){
    t.m_wheel->state.lin_vel={vx,vy,vz};t.m_wheel->state.omega=om;
    ChTerrain terrain;terrain.contact=contact;terrain.depth=depth;
    t.Synchronize(.5,terrain);
}
void row(const std::string& id,Generic_TMeasyTire& t,double vx,double vy,double om,double dt,double depth,double bx=0,double by=0,double vz=0,bool contact=true,double advance=-1){
    t.m_states.brx=bx;t.m_states.bry=by;t.m_stepsize=dt;
    input(t,vx,vy,om,depth,vz,contact);if(advance!=-2)t.Advance(advance<0?dt:advance);
    auto f=t.m_tireforce.force,m=t.m_tireforce.moment;
    std::cout<<id<<','<<vx<<','<<vy<<','<<om<<','<<dt<<','<<depth<<','<<t.m_data.normal_force<<','<<t.m_states.R_eff<<','<<t.m_states.sx<<','<<t.m_states.sy<<','<<f.x()<<','<<f.y()<<','<<m.x()<<','<<m.y()<<','<<m.z()<<','<<t.m_states.brx<<','<<t.m_states.bry<<','<<t.m_states.q<<','<<t.m_states.P_len<<'\n';
}
int main(int argc,char** argv){
    std::cout<<std::setprecision(17);
    Generic_TMeasyTire base;double d=base.m_par.pn/base.m_d1,R=base.m_unloaded_radius-d/3;
    if(argc>1 && std::string(argv[1])=="fixture"){
        std::cout<<"pn,R0,width,rim,d1,dz,rr,depth,Reff,fc_mu_ratio\n"<<base.m_par.pn<<','<<base.m_unloaded_radius<<','<<base.m_width<<','<<base.m_rim_radius<<','<<base.m_d1<<','<<base.m_par.dz<<','<<base.m_rolling_resistance<<','<<d<<','<<R<<','<<double(.8f)/base.m_par.mu_0<<'\n';return 0;
    }
    if(argc>1 && std::string(argv[1])=="benchmark"){
        std::cout<<"regime,work_unit,mean_ns,median_ns,p95_ns,p99_ns,worst_ns,samples,allocations\n";
        volatile double sink=0;
        for(const auto& regime:std::vector<std::pair<std::string,double>>{{"forward",10},{"blend",2},{"near_zero",.01},{"reverse",-10}}){
            for(int phase=0;phase<2;phase++){
                Generic_TMeasyTire t; t.m_stepsize=.001;
                auto call=[&](){if(!phase){input(t,regime.second,.1,regime.second/R,d);t.Advance(.001);sink=t.m_tireforce.force.x();}else{double fx,fy;t.CombinedCoulombForces(fx,fy,t.m_par.pn,1);sink=fx;}};
                input(t,regime.second,.1,regime.second/R,d);
                for(int i=0;i<2000;i++)call();
                std::vector<double> timings;timings.reserve(10000);size_t allocation_start=allocations;
                for(int i=0;i<10000;i++){auto a=std::chrono::steady_clock::now();call();auto b=std::chrono::steady_clock::now();timings.push_back(std::chrono::duration<double,std::nano>(b-a).count());}
                size_t measured_allocations=allocations-allocation_start;double sum=0;for(double x:timings)sum+=x;std::sort(timings.begin(),timings.end());
                std::cout<<regime.first<<','<<(phase?"bristle":"synchronize_advance")<<','<<sum/timings.size()<<','<<timings[5000]<<','<<timings[9500]<<','<<timings[9900]<<','<<timings.back()<<','<<timings.size()<<','<<measured_allocations<<'\n';
            }
        } (void)sink;return 0;
    }
    std::cout<<"id,vx_mps,vy_mps,omega_radps,dt_s,depth_m,Fz_N,Reff_m,sx,sy,Fx_N,Fy_N,Mx_Nm,My_Nm,Mz_Nm,brx_m,bry_m,q,patch_m\n";
    auto emit=[&](std::string id,double vx,double vy,double om,double dt=.001,double bx=0,double by=0){Generic_TMeasyTire t;row(id,t,vx,vy,om,dt,d,bx,by);};
    for(double slip:{-.2,-.02,-.0000001,0.,.0000001,.02,.2}){
        double w=10/R,den=10.01;
        emit("long_"+(slip==1e-7?std::string("tiny_positive"):slip==-1e-7?std::string("tiny_negative"):std::to_string(slip)),10-den*slip,0,w);
        emit("lat_"+(slip==1e-7?std::string("tiny_positive"):slip==-1e-7?std::string("tiny_negative"):std::to_string(slip)),10,-den*slip,w);
        if(slip!=0)emit("combined_"+(slip==1e-7?std::string("tiny_positive"):slip==-1e-7?std::string("tiny_negative"):std::to_string(slip)),10-den*slip,-den*slip,w);
    }
    for(double v:{-10.,-3.,-1.,-.01,0.,.01,1.,3.,10.})emit("speed_"+std::to_string(v),v,.01,(v-.01)/R);
    for(double v:{.999999,1.,1.000001,2.999999,3.,3.000001})emit("threshold_"+std::to_string(v),v,.1,v/R);
    emit("forward_reflect",10,.1,9.9/R);emit("reverse_reflect",-10,-.1,-9.9/R);
    for(double mult:{.5,1.,2.,4.}){Generic_TMeasyTire t;double dep=d*mult,rr=t.m_unloaded_radius-dep/3;row("load_"+std::to_string(mult),t,10,.1,9.9/rr,.001,dep);}
    for(double initial:{0.,.001,-.001})emit("memory_"+std::to_string(initial),0,.01,0,.001,initial,initial);
    for(double dt:{.01,.005,.0025,.00125}){
        Generic_TMeasyTire t;t.m_stepsize=dt;
        // A single axis, constant slip, exact linear Dahl ODE comparison over .1 s.
        for(int i=0;i<int(std::lround(.1/dt));i++){input(t,.1,0,0,d);t.Advance(dt);}
        row("history_"+std::to_string(dt),t,.1,0,0,dt,d,t.m_states.brx,t.m_states.bry,0,true,-2);
    }
    {Generic_TMeasyTire t;row("no_contact",t,0,0,0,.001,d,.001,.001,0,false);}
    {Generic_TMeasyTire t;row("negative_normal",t,0,0,0,.001,d,.001,.001,2*t.m_par.pn/t.m_par.dz);}
    {Generic_TMeasyTire t;double vz=t.GetNormalStiffnessForce(d)/t.m_par.dz;row("zero_normal",t,0,0,0,.001,d,0,0,vz);}
    {Generic_TMeasyTire t;row("arg_dt_small",t,.1,0,0,.001,d,0,0,0,true,.001);}
    {Generic_TMeasyTire t;row("arg_dt_large",t,.1,0,0,.001,d,0,0,0,true,.01);}
    emit("release_storage",0,0,.01/R,.001,.001);
    return 0;
}
