export function createStudioTachometer(parent) {
  const canvas = document.createElement('canvas');
  canvas.width = 360;
  canvas.height = 220;
  canvas.setAttribute('aria-label', 'Live engine tachometer');
  parent.prepend(canvas);
  const context = canvas.getContext('2d');
  return (rpm, limit) => {
    const c = context;
    c.clearRect(0, 0, 360, 220);
    const maximum = Math.ceil(Math.max(limit * 1.15, rpm, 1000) / 1000) * 1000;
    const angle = value => Math.PI * .8 + Math.PI * 1.4 * value / maximum;
    c.lineWidth = 12;
    c.strokeStyle = '#202c38';
    c.beginPath(); c.arc(180, 140, 110, angle(0), angle(maximum)); c.stroke();
    c.strokeStyle = '#7e2638';
    c.beginPath(); c.arc(180, 140, 110, angle(limit), angle(maximum)); c.stroke();
    for (let value = 0; value <= maximum; value += 500) {
      const a = angle(value);
      c.strokeStyle = value >= limit ? '#ff6e80' : '#8b9bab';
      c.lineWidth = value % 1000 ? 1 : 2;
      c.beginPath();
      c.moveTo(180 + Math.cos(a) * 91, 140 + Math.sin(a) * 91);
      c.lineTo(180 + Math.cos(a) * 102, 140 + Math.sin(a) * 102); c.stroke();
      if (value % 1000 === 0) {
        c.fillStyle = c.strokeStyle; c.font = 'bold 12px system-ui'; c.textAlign = 'center';
        c.fillText(value / 1000, 180 + Math.cos(a) * 77, 144 + Math.sin(a) * 77);
      }
    }
    const a = angle(Math.max(0, rpm));
    c.strokeStyle = '#ff7026'; c.lineWidth = 4; c.shadowColor = '#ff7026'; c.shadowBlur = 8;
    c.beginPath(); c.moveTo(180, 140); c.lineTo(180 + Math.cos(a) * 95, 140 + Math.sin(a) * 95); c.stroke();
    c.shadowBlur = 0;
    c.fillStyle = '#edf3fa'; c.font = '800 29px system-ui'; c.textAlign = 'center';
    c.fillText(Math.round(rpm), 180, 194);
    c.fillStyle = '#91a0b0'; c.font = 'bold 10px system-ui'; c.fillText('ENGINE RPM', 180, 210);
    canvas.setAttribute('aria-label', 'Engine ' + Math.round(rpm) + ' RPM, limit ' + Math.round(limit) + ' RPM');
  };
}
