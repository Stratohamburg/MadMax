import type { Composition } from "../loadout/compose";
import { advanceAssemblyDrive, createAssemblyDrive } from "./assembly-drive";
import { rad } from "./physics/math";
import { SURFACES } from "./physics/surfaces";

/** 走真实变速箱/供给接入的普通驾驶矩阵。阈值仅用于验收，不参与物理求解。 */
export function assemblyNormalMatrix(composition: Composition) {
  return (["hard", "loose", "wet"] as const).flatMap(family =>
    [0.2, 0.5, 1].flatMap(fraction => ["side", "behind", "switch"].map(scenario => {
      const speed = composition.profile.power.maxSpeed * fraction;
      let drive = createAssemblyDrive(composition, { worldVelocity: { x: speed, y: 0 } });
      let peakSlip = 0, peakYaw = 0, finite = true;
      const surface = () => SURFACES[family];
      for (let i = 0; i < 720; i++) {
        const angle = scenario === "behind" ? Math.PI : scenario === "side" ? Math.PI / 2 : (Math.floor(i / 60) % 2 ? 1 : -1) * rad(120);
        drive = advanceAssemblyDrive(drive, { targetSpeed: speed, angle, drift: false }, composition, surface);
        const s = drive.vehicle;
        if (s.speed > 0.3) peakSlip = Math.max(peakSlip, Math.abs(s.beta));
        peakYaw = Math.max(peakYaw, Math.abs(s.r));
        finite &&= [s.position.x, s.position.y, s.speed, s.r, s.beta, ...Object.values(s.wheelSpeeds), drive.drivetrain.rpm].every(Number.isFinite);
      }
      return { family, fraction, scenario, peakSlip, peakYaw, finite, passed: finite && peakSlip < rad(45) };
    })));
}
