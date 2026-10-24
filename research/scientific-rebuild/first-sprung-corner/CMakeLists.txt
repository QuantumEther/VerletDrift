cmake_minimum_required(VERSION 3.20)
project(first_sprung_corner LANGUAGES CXX)
if(NOT CHRONO_SOURCE OR NOT CHRONO_BUILD OR NOT VEHICLE_LIBRARY_DIR OR NOT EIGEN_INCLUDE)
  message(FATAL_ERROR "Supply pinned Chrono source/build, selected Vehicle library directory, and Eigen include")
endif()
add_executable(corner first_sprung_corner.cpp
  ${CHRONO_SOURCE}/src/chrono_models/vehicle/generic/Generic_Wheel.cpp
  ${CHRONO_SOURCE}/src/chrono_models/vehicle/generic/tire/Generic_TMeasyTire.cpp)
target_compile_features(corner PRIVATE cxx_std_17)
target_compile_options(corner PRIVATE -march=native)
target_compile_definitions(corner PRIVATE EIGEN_DONT_PARALLELIZE _ENABLE_EXTENDED_ALIGNED_STORAGE)
target_include_directories(corner PRIVATE ${CHRONO_SOURCE}/src ${CHRONO_BUILD} ${EIGEN_INCLUDE})
target_link_libraries(corner PRIVATE ${VEHICLE_LIBRARY_DIR}/libChrono_vehicle.so ${CHRONO_BUILD}/lib/libChrono_core.so)
set_target_properties(corner PROPERTIES BUILD_RPATH "${VEHICLE_LIBRARY_DIR};${CHRONO_BUILD}/lib")
