// VERLETDRIFT RESEARCH PATCH — NOT UPSTREAM CHRONO.
// Native prescribed-contact history test; observer has no physics/state overrides.
#include <cmath>
#include <iomanip>
#include <iostream>
#include <memory>
#include "chrono/physics/ChSystemSMC.h"
#include "chrono_vehicle/terrain/FlatTerrain.h"
#include "chrono_vehicle/wheeled_vehicle/ChSpindle.h"
#include "chrono_models/vehicle/generic/Generic_Wheel.h"
#include "chrono_models/vehicle/generic/tire/Generic_TMeasyTire.h"
using namespace chrono;
using namespace chrono::vehicle;
using namespace chrono::vehicle::generic;
struct Observer : Generic_TMeasyTire {
    Observer():Generic_TMeasyTire("safety-history"){}
    ChVector2d Bristles()const{ChVector2d z;GetInternalStates(z);return z;}
    double Dz()const{return m_par.dz;}
    double Elastic(double d)const{return GetNormalStiffnessForce(d);}
    TerrainForce Cache()const{return m_tireforce;}
};
bool finite(const ChVector3d& v){return std::isfinite(v.x())&&std::isfinite(v.y())&&std::isfinite(v.z());}
void vec(const ChVector3d& v){std::cout<<','<<v.x()<<','<<v.y()<<','<<v.z();}
int main(){
    ChSystemSMC sys;sys.SetGravitationalAcceleration(ChVector3d(0,0,0));
    auto body=chrono_types::make_shared<ChSpindle>();body->SetMass(1);body->SetInertiaXX(ChVector3d(1,1,1));sys.AddBody(body);
    auto wheel=chrono_types::make_shared<Generic_Wheel>("history-wheel");wheel->Initialize(nullptr,body,LEFT,0);wheel->EnableCollision(false);
    auto observer=chrono_types::make_shared<Observer>();std::shared_ptr<ChTire> tire=observer;
    wheel->SetTire(tire);tire->Initialize(wheel);tire->SetCollisionType(ChTire::CollisionType::SINGLE_POINT);tire->SetStepsize(.001);
    FlatTerrain road(0,.8f);
    std::cout<<std::setprecision(17)<<"phase,driver_time_s,native_time_before_s,native_time_after_s,integrated,hub_height_m,vx_mps,vy_mps,vz_mps,depth_m,active,Fn_N,brx_before_m,bry_before_m,brx_after_m,bry_after_m";
    for(auto p:{"returned_force","returned_moment","cache_force","cache_moment","applied_force","applied_moment"})for(auto a:{"x","y","z"})std::cout<<','<<p<<'_'<<a;
    std::cout<<'\n';
    const char* phases[]={"loaded_1","loaded_2","positive_unload","zero_support","direct_resupport","separated","zero_penetration","recontact","loaded_no_slip"};
    for(int i=0;i<9;++i){
        // Prescribed fixture samples, not a free-vehicle trajectory or internal-state reset.
        double h=.449072,vx=.1,vy=.01,vz=0;
        if(i==2||i==3||i==8){vx=0;vy=0;}
        if(i==5){h=.4799;vx=vy=0;}
        if(i==6){h=.4699;vx=vy=0;}
        body->SetPos(ChVector3d(0,0,h));body->SetRot(QUNIT);body->SetPosDt(ChVector3d(vx,vy,0));body->SetAngVelParent(ChVector3d(0,0,0));
        if(i==2||i==3){
            tire->Synchronize(i*.001,road);
            vz=observer->Elastic(observer->ReportTireContactData().depth)/observer->Dz()-(i==2?1e-6:0);
            body->SetPosDt(ChVector3d(vx,vy,vz));
        }
        auto before=observer->Bristles();
        body->EmptyTireAccumulator();tire->Synchronize(i*.001,road);wheel->Synchronize();tire->Advance(.001);
        auto after=observer->Bristles();auto data=observer->ReportTireContactData();
        auto returned=tire->ReportTireForce(&road);auto cache=observer->Cache();auto idx=body->GetTireAccumulatorIndex();
        auto applied_force=body->GetAccumulatedForce(idx);auto applied_moment=body->TransformDirectionLocalToParent(body->GetAccumulatedTorque(idx));
        double start=sys.GetChTime();bool integrate=finite(applied_force)&&finite(applied_moment);
        if(integrate)sys.DoStepDynamics(.001); // Never hide an invalid baseline integration attempt.
        std::cout<<phases[i]<<','<<i*.001<<','<<start<<','<<sys.GetChTime()<<','<<integrate<<','<<h<<','<<vx<<','<<vy<<','<<vz<<','<<data.depth<<','<<data.in_contact<<','<<data.normal_force<<','<<before.x()<<','<<before.y()<<','<<after.x()<<','<<after.y();
        vec(returned.force);vec(returned.moment);vec(cache.force);vec(cache.moment);vec(applied_force);vec(applied_moment);std::cout<<'\n';
    }
}
