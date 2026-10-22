// ══════════════════════════════════════════════════════════
// NOTIFICACIONES PUSH (Notifications API + Realtime)
// ══════════════════════════════════════════════════════════
async function setupPushNotifications() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    await Notification.requestPermission();
  }
  if (Notification.permission !== 'granted') return;

  // Escuchar nuevas impugnaciones en tiempo real
  _sb.channel('rt-impugnaciones')
    .on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'infracciones',
      filter: 'estado=eq.impugnada'
    }, payload => {
      if (_rol === 'admin' || _rol === 'supervisor') {
        const r = payload.new;
        new Notification('Tránsito Municipal — Impugnación', {
          body: `Infracción ${r.folio||r.id} (${r.placa}) fue impugnada. Requiere resolución.`,
          icon: '/manifest.json',
          tag: `imp-${r.id}`
        });
      }
    })
    .subscribe();

  // Escuchar nuevos accidentes
  _sb.channel('rt-accidentes')
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'accidentes'
    }, payload => {
      if (_rol === 'admin' || _rol === 'supervisor') {
        const r = payload.new;
        new Notification('Tránsito Municipal — Accidente', {
          body: `Nuevo accidente registrado en ${r.ubicacion||'ubicación desconocida'}.`,
          tag: `acc-${r.id}`
        });
      }
    })
    .subscribe();
}
