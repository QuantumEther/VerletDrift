#!/usr/bin/env python3
"""Run the frozen Mission 23 headless cases and emit trace checks/metadata."""
import argparse
import csv
import hashlib
import gzip
import json
import math
import os
import platform
import statistics
import subprocess
import sys
import time
from pathlib import Path
import numpy as np


def sha(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def read_csv(path):
    with open(path, newline="") as f:
        return list(csv.DictReader(f))


def finite_rows(rows):
    for i, row in enumerate(rows, 1):
        if row.get("solver_status") != "accepted" or row.get("finite") != "1":
            return False, i, "rejected solver status or finite-state check"
        for key, value in row.items():
            try:
                number = float(value)
            except (TypeError, ValueError):
                continue
            if not math.isfinite(number):
                return False, i, f"nonfinite {key}"
    return True, None, None


def vals(rows, key):
    return [float(row[key]) for row in rows]


def nearest_at(rows, t, key, tol=1e-9):
    row = min(rows, key=lambda item: abs(float(item["time_s"]) - t))
    if abs(float(row["time_s"]) - t) > tol:
        raise ValueError(f"no matched sample for {t} s")
    return float(row[key])


def check(ok, label, evidence, result):
    result["checks"].append({"name": label, "status": "PASS" if ok else "FAIL", "evidence": evidence})


def summarize_performance(rows, key):
    values = sorted(vals(rows, key))
    def q(p):
        return values[min(len(values) - 1, max(0, math.ceil(p * len(values)) - 1))]
    return {"mean_us": statistics.fmean(values), "median_us": statistics.median(values),
            "p95_us": q(.95), "p99_us": q(.99), "worst_us": values[-1], "samples": len(values)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--binary", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--chrono-source", type=Path, default=Path("/tmp/m20-chrono"))
    ap.add_argument("--patched-library", type=Path, default=Path("/tmp/m22-variant/lib/libChrono_vehicle.so"))
    args = ap.parse_args()
    binary = args.binary.resolve()
    out = args.out.resolve()
    linked_libraries = subprocess.check_output(["ldd",str(binary)],text=True)
    if str(args.patched_library.resolve()) not in linked_libraries:
        raise SystemExit("selected executable does not load the Mission 22 patched Vehicle library")
    chrono_head = subprocess.check_output(["git","-C",str(args.chrono_source.resolve()),"rev-parse","HEAD"],text=True).strip()
    original_cpp_hash = sha(args.chrono_source.resolve()/"src/chrono_vehicle/wheeled_vehicle/tire/ChTMeasyTire.cpp")
    if chrono_head != "9a5072b5324e012a66d9fb7eaac0c679b8465e73" or original_cpp_hash != "4e254282b6e45eeb17e7206d08eb512b08f1c5e20402b198b26de7026b93322a":
        raise SystemExit("pinned original Chrono source changed or does not match Mission 22 provenance")
    out.mkdir(parents=True, exist_ok=True)
    if any(out.iterdir()):
        raise SystemExit("output directory must be fresh; use a new path to preserve previous experiment results")
    cases = [
        ("static", None), ("disturbance", None), ("spin", None), ("drive", None),
        ("brake", None), ("brake_high", None), ("unload", None), ("boundary", None),
        ("refine_1ms", .001), ("refine_05ms", .0005), ("refine_025ms", .00025),
        ("bench", None),
    ]
    commands = []
    wall = {}
    for name, h in cases:
        trace = out / f"{name}.csv"
        cmd = [str(binary), "refine" if name.startswith("refine_") else name, str(trace)]
        if h is not None:
            cmd.append(str(h))
        start = time.perf_counter()
        proc = subprocess.run(cmd, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        wall[name] = time.perf_counter() - start
        commands.append({"argv": cmd, "exit_code": proc.returncode, "runtime_s_including_process_and_csv": wall[name], "output": proc.stdout.strip()})
        if proc.returncode != 0:
            raise SystemExit(f"case {name} failed: {proc.stdout}")

    result = {"experiment_id": "M23-CORNER-001", "branch": "scientific-rebuild/10-first-sprung-corner",
              "git_head_before_run": subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip(),
              "workspace_dirty_during_run": bool(subprocess.check_output(["git", "status", "--porcelain"], text=True).strip()),
              "runtime": {"python": sys.version, "platform": platform.platform(), "machine": platform.machine(),
                          "processor": platform.processor(), "binary": str(binary), "binary_sha256": sha(binary),
                          "chrono_source_head": chrono_head,
                          "chrono_original_cpp_sha256": original_cpp_hash,
                          "patched_vehicle_library": str(args.patched_library.resolve()),
                          "patched_vehicle_library_sha256": sha(args.patched_library.resolve()),
                          "linked_libraries": linked_libraries,
                          "cxx_compiler": subprocess.check_output(["c++","--version"],text=True).splitlines()[0],
                          "numpy": np.__version__,
                          "cpu_lscpu": subprocess.check_output(["lscpu"],text=True)},
              "commands": commands, "checks": []}
    traces = {name: read_csv(out / f"{name}.csv") for name, _ in cases}
    meta = {name: json.loads((out / f"{name}.csv.meta.json").read_text()) for name, _ in cases}
    for name, rows in traces.items():
        ok, row, why = finite_rows(rows)
        check(ok, f"{name}: accepted finite trace", {"samples": len(rows), "failed_row": row, "reason": why}, result)

    s = traces["static"]
    sm = meta["static"]
    tail = [r for r in s if float(r["time_s"]) >= float(s[-1]["time_s"]) - 1.0]
    fn = statistics.fmean(vals(tail, "normal_N"))
    spring_force = statistics.fmean(vals(tail, "spring_damper_force_N"))
    body_v = max(map(abs, vals(tail, "body_vz_m_s")))
    carrier_v = max(map(abs, vals(tail, "carrier_vz_m_s")))
    guide_fz = max(map(abs, vals(tail, "body_guide_reaction_z_N") + vals(tail, "carrier_guide_reaction_z_N")))
    target_sprung = sm["sprung_mass_kg"] * 9.81
    target_contact = (sm["sprung_mass_kg"] + sm["carrier_mass_kg"] + sm["wheel_tire_mass_kg"]) * 9.81
    check(abs(fn-target_contact) < 1e-7 and abs(spring_force-target_sprung) < 1e-7 and body_v < 1e-8 and carrier_v < 1e-8 and guide_fz < 1e-7,
          "static gravity force balance", {"measured_tire_N": fn, "expected_tire_N": target_contact,
          "measured_spring_N": spring_force, "expected_spring_N": target_sprung,
          "max_body_vertical_speed_m_s": body_v, "max_carrier_vertical_speed_m_s": carrier_v,
          "max_vertical_guide_reaction_N": guide_fz}, result)

    spin, spin_meta = traces["spin"], meta["spin"]
    spin_impulse = sum(float(r["shaft_port_torque_Nm"]) * float(r["h_s"]) for r in spin)
    spin_delta_l = spin_meta["wheel_tire_axle_inertia_kg_m2"] * (float(spin[-1]["relative_omega_rad_s"]) - float(spin[0]["relative_omega_rad_s"]))
    spin_dE = float(spin[-1]["kinetic_J"]) - float(spin[0]["kinetic_J"])
    spin_work = float(spin[-1]["drive_work_J"])
    check(abs(spin_delta_l-spin_impulse) < 1e-7, "free-wheel angular momentum", {"integrated_torque_impulse_Nms": spin_impulse, "wheel_delta_L_Nms": spin_delta_l}, result)
    check(abs(spin_dE-spin_work) < 1e-7, "free-wheel torque work", {"delta_rotational_energy_J": spin_dE, "drive_work_J": spin_work, "ledger_residual_J": spin[-1]["mechanical_energy_residual_J"]}, result)

    for name, expected_impulse in (("brake", -20.0), ("brake_high", -100.0)):
        rows, m = traces[name], meta[name]
        impulse = sum(float(r["shaft_port_torque_Nm"]) * float(r["h_s"]) for r in rows)
        delta_l = m["wheel_tire_axle_inertia_kg_m2"] * (float(rows[-1]["relative_omega_rad_s"]) - float(rows[0]["relative_omega_rad_s"]))
        check(abs(impulse-expected_impulse) < 1e-8 and abs(delta_l-impulse) < 1e-7 and float(rows[-1]["relative_omega_rad_s"]) > 0,
              f"{name}: slipping brake torque response", {"torque_impulse_Nms": impulse, "wheel_delta_L_Nms": delta_l,
              "final_relative_speed_rad_s": rows[-1]["relative_omega_rad_s"], "brake_work_J": rows[-1]["brake_work_J"]}, result)

    dr = traces["drive"]
    max_fx = max(vals(dr, "Fx_N"))
    max_fixture_x = max(map(abs, vals(dr, "wheel_x_m")))
    max_guide_x = max(map(abs, vals(dr, "carrier_guide_reaction_x_N")))
    check(max_fx > 100 and max_fixture_x < 1e-8 and max_guide_x > 1,
          "driven tire force transmitted to constrained guide", {"peak_Fx_N": max_fx, "max_hub_x_m": max_fixture_x,
          "peak_carrier_guide_reaction_x_N": max_guide_x, "interpretation": "fixed x guide reacts to force; no vehicle acceleration claim"}, result)

    boundary = traces["boundary"]
    boundary_geometric = [r for r in boundary if r["geometric_contact"] == "1"]
    exact = min(boundary_geometric, key=lambda r: abs(float(r["normal_raw_N"])))
    check(abs(float(exact["normal_raw_N"])) < 1e-8 and exact["geometric_contact"] == "1" and exact["contact_active"] == "0",
          "exact-zero support remains inactive with finite history", {"raw_normal_N": exact["normal_raw_N"], "applied_normal_N": exact["normal_N"],
          "bristle_x_m": exact["brx_m"], "bristle_y_m": exact["bry_m"], "active": exact["contact_active"]}, result)
    prior = min(boundary_geometric, key=lambda r: abs(float(r["force_evaluation_time_s"])))
    check(math.hypot(float(prior["brx_m"]),float(prior["bry_m"])) > 1e-9,
          "zero-load boundary preserves a pre-existing finite bristle history",
          {"bristle_x_m":prior["brx_m"],"bristle_y_m":prior["bry_m"],"raw_normal_N":prior["normal_raw_N"],"active":prior["contact_active"]},result)
    unload = traces["unload"]
    raw_negative = [r for r in unload if r["geometric_contact"] == "1" and float(r["normal_raw_N"]) < 0]
    low_positive = [r for r in unload if r["geometric_contact"] == "1" and 0 < float(r["normal_N"]) < target_contact * .05]
    detached = [r for r in unload if r["geometric_contact"] == "0"]
    states = {r["contact_active"] for r in unload}
    check(bool(raw_negative) and bool(low_positive) and bool(detached) and states == {"0", "1"} and all(math.isfinite(float(r["brx_m"])) and math.isfinite(float(r["bry_m"])) for r in unload),
          "load reduction, negative support, separation and recontact remain finite", {"negative_raw_support_samples": len(raw_negative),
          "low_positive_support_samples": len(low_positive), "separated_samples": len(detached), "contact_states": sorted(states),
          "recontact_count": sum(1 for x,y in zip(unload,unload[1:]) if x["contact_active"]=="0" and y["contact_active"]=="1")}, result)

    # Independent reduced vertical model: sprung/unsprung two-mass M,C,K
    # linearization at the measured static tire depth. It deliberately omits
    # large-signal nonlinear contact and internal bristle dynamics.
    dm=meta["disturbance"]
    M=np.diag([dm["sprung_mass_kg"],dm["carrier_mass_kg"]+dm["wheel_tire_mass_kg"]])
    C=np.array([[dm["suspension_damping_N_s_m"],-dm["suspension_damping_N_s_m"]],
                [-dm["suspension_damping_N_s_m"],dm["suspension_damping_N_s_m"]+dm["tire_vertical_damping_N_s_m"]]])
    K=np.array([[dm["spring_rate_N_m"],-dm["spring_rate_N_m"]],
                [-dm["spring_rate_N_m"],dm["spring_rate_N_m"]+dm["local_tire_vertical_stiffness_N_m"]]])
    A=np.block([[np.zeros((2,2)),np.eye(2)],[-np.linalg.solve(M,K),-np.linalg.solve(M,C)]])
    eig=np.linalg.eigvals(A)
    slow=sorted((z for z in eig if z.imag>1e-8),key=lambda z:abs(z.imag))[0]
    peaks=[i for i in range(1,len(traces["disturbance"])-1)
           if float(traces["disturbance"][i]["body_z_m"])>float(traces["disturbance"][i-1]["body_z_m"])
           and float(traces["disturbance"][i]["body_z_m"])>=float(traces["disturbance"][i+1]["body_z_m"])]
    peaks=[i for i in peaks if float(traces["disturbance"][i]["time_s"])<1.5]
    if len(peaks)<2: raise SystemExit("disturbance trace lacks two measurable sprung-mass peaks")
    p0,p1=(traces["disturbance"][i] for i in peaks[:2])
    measured_period=float(p1["time_s"])-float(p0["time_s"])
    measured_freq=1/measured_period
    amp0=float(p0["body_z_m"])-1.2
    amp1=float(p1["body_z_m"])-1.2
    measured_decay=math.log(amp0/amp1)/measured_period
    linearized={"eigenvalues_per_s":[[float(z.real),float(z.imag)] for z in eig],
                "slow_mode_hz":abs(slow.imag)/(2*math.pi),"slow_mode_decay_per_s":-float(slow.real),
                "measured_peak_period_s":measured_period,"measured_peak_frequency_hz":measured_freq,
                "measured_logarithmic_decay_per_s":measured_decay,
                "frequency_relative_error":abs(measured_freq-abs(slow.imag)/(2*math.pi))/(abs(slow.imag)/(2*math.pi)),
                "decay_relative_error":abs(measured_decay+float(slow.real))/abs(float(slow.real)),
                "assumptions":"linear tire stiffness/damping at static depth; heave-only bodies; one dominant sprung mode"}
    check(linearized["frequency_relative_error"]<.02 and linearized["decay_relative_error"]<.05,
          "vertical disturbance agrees with reduced linearized two-mass mode",linearized,result)
    result["linearized_vertical_model"]=linearized

    # Independent rigid wrench transform from logged local force/moment and points.
    wrench_errors = []
    for rows in (traces["drive"], traces["unload"]):
        for r in rows:
            # For this fixture, tire axes align with ISO x/y/z; the P-C moment arm
            # is still evaluated independently from recorded world points.
            px,py,pz = (float(r[k]) for k in ("contact_point_x_m","contact_point_y_m","contact_point_z_m"))
            cx,cy,cz = (float(r[k]) for k in ("hub_x_m","hub_y_m","hub_z_m"))
            fx,fy,fz = (float(r[k]) for k in ("Fx_local_N","Fy_local_N","Fz_local_N"))
            mx,my,mz = (float(r[k]) for k in ("Mx_contact_Nm","My_contact_Nm","Mz_contact_Nm"))
            calc = (mx+(py-cy)*fz-(pz-cz)*fy, my+(pz-cz)*fx-(px-cx)*fz, mz+(px-cx)*fy-(py-cy)*fx)
            actual = tuple(float(r[k]) for k in ("Mx_hub_Nm","My_hub_Nm","Mz_hub_Nm"))
            wrench_errors.append(max(abs(x-y) for x,y in zip(calc,actual)))
    wrench_error = max(wrench_errors, default=0.0)
    check(wrench_error < 1e-8, "hub wrench moment translation", {"maximum_independent_reconstruction_error_Nm": wrench_error}, result)

    ref = traces["refine_025ms"]
    convergence = {}
    for name in ("refine_1ms", "refine_05ms"):
        rows = traces[name]
        step = float(rows[0]["h_s"])
        common = [float(r["time_s"]) for r in ref if abs(round(float(r["time_s"])/step)*step-float(r["time_s"])) < 1e-10]
        state_errors = {}
        for key in ("body_z_m", "carrier_z_m", "wheel_z_m", "relative_omega_rad_s", "normal_N", "Fx_N"):
            diffs = [nearest_at(rows,t,key)-nearest_at(ref,t,key) for t in common]
            state_errors[key] = {"rms": math.sqrt(statistics.fmean(d*d for d in diffs)), "max_abs": max(map(abs,diffs))}
        convergence[name] = {"common_samples": len(common), "state_errors_vs_0.25ms": state_errors,
                             "final_energy_residual_J": rows[-1]["mechanical_energy_residual_J"]}
    check(convergence["refine_05ms"]["state_errors_vs_0.25ms"]["relative_omega_rad_s"]["rms"] <= convergence["refine_1ms"]["state_errors_vs_0.25ms"]["relative_omega_rad_s"]["rms"]*1.05,
          "timestep refinement comparison", convergence, result)
    result["timestep_convergence"] = convergence

    bench = traces["bench"]
    result["performance"] = {key: summarize_performance(bench,key) for key in ("tire_update_us","native_mechanical_us","total_step_us")}
    result["performance"]["benchmark"] = {"warmup_steps": meta["bench"]["warmup_steps"], "recorded_steps": len(bench), "physical_duration_s": float(bench[-1]["time_s"])-float(bench[0]["force_evaluation_time_s"]),
       "process_and_csv_runtime_s": wall["bench"], "steps_per_wall_second_including_startup_and_csv": len(bench)/wall["bench"]}
    result["source_file_hashes"] = {str(p.relative_to(Path(__file__).parent)):sha(p) for p in sorted(Path(__file__).parent.iterdir()) if p.is_file() and p.suffix in {".cpp",".py",".txt",".json"}}
    result["patch_sha256"] = sha(Path(__file__).parent.parent/"tmeasy-safety-experiment/zero-load.patch")
    compressed_traces=[]
    for path in sorted(out.glob("*.csv")):
        compressed=path.with_suffix(path.suffix+".gz")
        with open(path,"rb") as src, open(compressed,"wb") as raw:
            with gzip.GzipFile(filename="",mode="wb",fileobj=raw,compresslevel=9,mtime=0) as dst:
                for block in iter(lambda:src.read(1024*1024),b""):
                    dst.write(block)
        path.unlink()
        compressed_traces.append(compressed)
    result["trace_hashes"] = {p.name: sha(p) for p in compressed_traces}
    result["trace_sizes_bytes"] = {p.name:p.stat().st_size for p in compressed_traces}
    result["metadata_hashes"] = {p.name: sha(p) for p in sorted(out.glob("*.meta.json"))}
    (out/"verification.json").write_text(json.dumps(result,indent=2,sort_keys=True)+"\n")
    failures=[c for c in result["checks"] if c["status"]!="PASS"]
    print(json.dumps({"checks":result["checks"],"performance":result["performance"],"failures":failures},indent=2))
    raise SystemExit(1 if failures else 0)


if __name__ == "__main__":
    main()
