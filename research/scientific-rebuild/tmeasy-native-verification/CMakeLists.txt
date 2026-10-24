cmake_minimum_required(VERSION 3.20)
project(tmeasy_native_verification LANGUAGES CXX)
if(NOT CHRONO_SOURCE OR NOT CHRONO_BUILD OR NOT EIGEN_INCLUDE)
  message(FATAL_ERROR "Supply CHRONO_SOURCE, CHRONO_BUILD, EIGEN_INCLUDE; build pinned Core + Vehicle first")
endif()
add_executable(tmeasy_native native.cpp
  ${CHRONO_SOURCE}/src/chrono_models/vehicle/generic/Generic_Wheel.cpp
  ${CHRONO_SOURCE}/src/chrono_models/vehicle/generic/tire/Generic_TMeasyTire.cpp)
target_compile_features(tmeasy_native PRIVATE cxx_std_17)
target_include_directories(tmeasy_native PRIVATE ${CHRONO_SOURCE}/src ${CHRONO_BUILD} ${EIGEN_INCLUDE})
target_link_directories(tmeasy_native PRIVATE ${CHRONO_BUILD}/lib)
target_link_libraries(tmeasy_native PRIVATE Chrono_vehicle Chrono_core)
set_target_properties(tmeasy_native PROPERTIES BUILD_RPATH "${CHRONO_BUILD}/lib")
# Match the selected upstream Core/Vehicle ABI and Eigen configuration.
target_compile_options(tmeasy_native PRIVATE -march=native)
target_compile_definitions(tmeasy_native PRIVATE EIGEN_DONT_PARALLELIZE _ENABLE_EXTENDED_ALIGNED_STORAGE)
