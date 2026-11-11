#include "SPlisHSPlasH/Common.h"
#include "Utilities/Logger.h"
#include "Utilities/Timing.h"
#include "Utilities/Counting.h"
INIT_LOGGING
INIT_TIMING
INIT_COUNTING
#include "SPlisHSPlasH/Simulation.h"
#include "SPlisHSPlasH/FluidModel.h"
#include "SPlisHSPlasH/TimeStep.h"
#include "SPlisHSPlasH/TimeManager.h"
#include <fstream>
#include <vector>
#include <cmath>
int main(int argc,char**argv){using namespace SPH;auto*s=Simulation::getCurrent();s->init(.014f,false);std::vector<Vector3r> p,v;std::vector<unsigned> ids;for(int z=-4;z<=4;z++)for(int y=-4;y<=4;y++)for(int x=-4;x<=4;x++)if(x*x+y*y+z*z<16){p.emplace_back(x*.028f,.4f+y*.028f,z*.028f);v.emplace_back(0,0,0);ids.push_back(0);}s->addFluidModel("water",p.size(),p.data(),v.data(),ids.data(),0);s->setSimulationMethod(4);s->deferredInit();TimeManager::getCurrent()->setTimeStepSize(.001f);std::ofstream out(argc>1?argv[1]:"particles.csv");out<<"time,id,x,y,z,vx,vy,vz,mass\n";auto*f=s->getFluidModel(0);for(int step=0;step<=10;step++){for(unsigned i=0;i<f->numActiveParticles();i++){auto a=f->getPosition(i),b=f->getVelocity(i);if(!a.allFinite()||!b.allFinite())return 2;out<<TimeManager::getCurrent()->getTime()<<','<<i<<','<<a.x()<<','<<a.y()<<','<<a.z()<<','<<b.x()<<','<<b.y()<<','<<b.z()<<','<<f->getMass(i)<<'\n';}if(step<10)s->getTimeStep()->step();}return out.good()?0:3;}
