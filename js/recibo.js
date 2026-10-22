// ══════════════════════════════════════════════════════════
// RECIBO DIGITAL (ciudadano.sql: datos_recibo, función "recibo")
// Al cobrar, Caja manda el recibo por WhatsApp (se abre con el texto listo)
// o por correo. El enlace lleva a /verificar, que muestra el recibo y
// confirma que es auténtico.
// ══════════════════════════════════════════════════════════
let _reciboPago = null;

async function ofrecerRecibo(pagoId) {
  const { data: p } = await _sb.from('pagos').select('id,folio_inf,monto_final,token_verificacion,created_at, infracciones(placa,infractor,telefono,infractor_correo)').eq('id', pagoId).single();
  if (!p) return;
  const inf = p.infracciones || {};
  _reciboPago = p;
  $('rec-resumen').innerHTML = `<strong>${esc(fmt(p.monto_final))}</strong> · ${esc(p.folio_inf || '—')} · placa <span class="mono">${esc(inf.placa || '—')}</span>${inf.infractor ? ' · ' + esc(inf.infractor) : ''}`;
  $('rec-telefono').value = (inf.telefono || '').replace(/\D/g, '').slice(-10);
  $('rec-correo').value = inf.infractor_correo || '';
  $('rec-estado').textContent = '';
  openModal('modal-recibo');
}

function urlRecibo(p) { return `${location.origin}/verificar?t=${p.token_verificacion}`; }

function reciboWhatsApp() {
  const p = _reciboPago; if (!p) return;
  const tel = $('rec-telefono').value.replace(/\D/g, '');
  if (tel.length !== 10) { $('rec-estado').textContent = 'Escribe un celular de 10 dígitos.'; $('rec-telefono').focus(); return; }
  const inf = p.infracciones || {};
  const msg = `Recibo de pago de su infracción de tránsito.\n\n` +
    `Folio: ${p.folio_inf || '—'}\nPlaca: ${inf.placa || '—'}\nTotal pagado: ${fmt(p.monto_final)}\n` +
    `Fecha: ${new Date(p.created_at).toLocaleString('es-MX', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}\n\n` +
    `Vea y verifique su recibo digital aquí:\n${urlRecibo(p)}\n\nDirección de Tránsito y Movilidad Municipal.`;
  window.open(`https://wa.me/52${tel}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
  $('rec-estado').textContent = 'WhatsApp abierto con el recibo listo para enviar.';
}

async function reciboCorreo() {
  const p = _reciboPago; if (!p) return;
  const correo = $('rec-correo').value.trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) { $('rec-estado').textContent = 'Escribe un correo válido.'; $('rec-correo').focus(); return; }
  const btn = $('rec-btn-correo'); btn.disabled = true;
  $('rec-estado').textContent = 'Enviando…';
  try {
    const { data: { session } } = await _sb.auth.getSession();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/recibo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${session?.access_token || SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ pago_id: Number(p.id), correo })
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || !d.ok) throw new Error(d.error || 'No se pudo enviar');
    $('rec-estado').textContent = `Recibo enviado a ${correo}.`;
    logActivity('pago', `Recibo ${p.folio_inf || ''} enviado por correo a ${correo}`).catch(() => {});
  } catch (e) {
    $('rec-estado').textContent = e.message + '. Puedes mandarlo por WhatsApp o imprimirlo.';
  } finally { btn.disabled = false; }
}

function reciboCopiarEnlace() {
  const p = _reciboPago; if (!p) return;
  navigator.clipboard.writeText(urlRecibo(p)).then(() => { $('rec-estado').textContent = 'Enlace del recibo copiado.'; })
    .catch(() => { $('rec-estado').textContent = urlRecibo(p); });
}
