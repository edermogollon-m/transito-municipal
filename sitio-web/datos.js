// ═══════════════════════════════════════════════════════════════════
// Datos de la página de la Dirección de Tránsito.
// Este es el único archivo que hay que editar para cambiar textos,
// horarios, teléfonos o la ubicación. Lo marcado "POR CONFIRMAR" son
// datos de ejemplo que el Ayuntamiento debe revisar.
// El nombre del municipio, el escudo, el color, los descuentos, la CLABE
// y los avisos viales se toman solos del sistema.
// ═══════════════════════════════════════════════════════════════════
const SITIO = {
  // Sistema de Tránsito (consulta, pagos, constancias y verificación)
  sistema: 'https://transito-municipal.vercel.app',
  supabase: {
    url: 'https://tqqeixymxpuewpjhcjno.supabase.co',
    // Llave pública (anon): solo permite lo que el sistema publica para ciudadanos
    llave: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRxcWVpeHlteHB1ZXdwamhjam5vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0MzkyNzQsImV4cCI6MjA5NjAxNTI3NH0.s6udOiDym2T7iAWXIqzl4det3cwb3lhEX20Udp-NeUs',
  },

  // Valores por si el sistema no responde
  municipio: 'Misantla',
  estado: 'Veracruz',
  uma: 117.31,                       // UMA 2026 (INEGI). Actualizar cada febrero.

  oficina: {
    nombre: 'Dirección de Tránsito y Vialidad',
    domicilio: 'Palacio Municipal, Centro, Misantla, Ver.',          // POR CONFIRMAR
    horario: [['Lunes a viernes', '8:00 a 15:00 h'], ['Sábado', '9:00 a 13:00 h']],   // POR CONFIRMAR
    telefono: '235 323 0000',                                      // POR CONFIRMAR
    whatsapp: '',                                                  // 10 dígitos, ej. 2351234567
    mapa: { lat: 19.9317, lng: -96.8496 },                         // POR CONFIRMAR
  },
  caja: {
    nombre: 'Tesorería Municipal · ventanilla de infracciones',
    domicilio: 'Palacio Municipal, planta baja',                   // POR CONFIRMAR
    horario: 'Lunes a viernes de 8:00 a 15:00 h',                  // POR CONFIRMAR
  },
  corralon: {
    domicilio: 'Corralón municipal',                               // POR CONFIRMAR
    horario: 'Lunes a viernes de 8:00 a 15:00 h',                  // POR CONFIRMAR
  },

  emergencias: [['Emergencias', '911'], ['Denuncia anónima', '089'], ['Cruz Roja', '065']],

  // Infracciones más comunes (catálogo del Reglamento de la Ley 561 de Veracruz)
  multas: [
    { icono: 'celular',   titulo: 'Usar el celular al manejar',               clase: 'Grave',     uma: [16, 30],  art: '160 fr. I' },
    { icono: 'cinturon',  titulo: 'No usar cinturón de seguridad',            clase: 'Muy grave', uma: [31, 40],  art: '154 fr. I' },
    { icono: 'semaforo',  titulo: 'Pasarse el semáforo en rojo',              clase: 'Muy grave', uma: [31, 40],  art: '95 fr. II, 136 fr. I y II' },
    { icono: 'casco',     titulo: 'Moto sin casco (conductor o pasajero)',    clase: 'Grave',     uma: [16, 30],  art: '166, 172 fr. IV' },
    { icono: 'estacion',  titulo: 'Estacionarse en lugar prohibido',          clase: 'Leve',      uma: [5, 15],   art: '183 fr. I' },
    { icono: 'velocidad', titulo: 'Exceso de velocidad',                      clase: 'Leve',      uma: [5, 15],   art: '75, 153 fr. IV' },
    { icono: 'licencia',  titulo: 'Manejar sin licencia vigente',             clase: 'Grave',     uma: [16, 30],  art: '153 fr. II, 157, 161' },
    { icono: 'alcohol',   titulo: 'Manejar en estado de ebriedad',            clase: 'Muy grave', uma: [80, 115], art: '244, 251, 254, 347', nota: 'Sin descuento y con arresto administrativo.' },
  ],

  tramites: [
    { id: 'corralon', titulo: 'Sacar mi vehículo del corralón', icono: 'grua',
      pasos: ['Consulta aquí tu placa para saber cuánto debes.', 'Paga la multa, el arrastre y los días de pensión en la Tesorería o en línea.', 'Acude al corralón con tu recibo y los documentos.', 'Revisa tu vehículo contra el inventario antes de firmar de recibido.'],
      requisitos: ['Identificación oficial vigente del propietario', 'Tarjeta de circulación o factura del vehículo', 'Recibo de pago de la multa y de los servicios de grúa y pensión', 'Si no eres el propietario: carta poder simple con copia de las identificaciones'] },
    { id: 'documento', titulo: 'Recuperar mi licencia, tarjeta o placa retenida', icono: 'documento',
      pasos: ['Paga la multa de la boleta (con descuento si estás en plazo).', 'Acude a la Dirección de Tránsito con tu recibo.', 'Te entregan el documento contra firma.'],
      requisitos: ['Recibo de pago', 'Identificación oficial del titular del documento', 'La boleta o su folio'] },
    { id: 'recurso', titulo: 'Inconformarme con una multa', icono: 'balanza',
      pasos: ['Presenta tu escrito de recurso de revocación en la Dirección de Tránsito dentro del plazo que marca tu boleta.', 'Explica por qué no estás de acuerdo y anexa tus pruebas (fotos, testigos, documentos).', 'Mientras se resuelve, la multa aparece "en revisión" y no tienes que pagarla.', 'Recibirás la resolución por escrito.'],
      requisitos: ['Escrito con tu nombre, domicilio y firma', 'Folio de la boleta', 'Pruebas que tengas', 'Identificación oficial'] },
    { id: 'constancia', titulo: 'Constancia de no infracción', icono: 'constancia',
      pasos: ['Escribe tu placa en el buscador de arriba.', 'Si no tienes multas pendientes, toca "Descargar constancia".', 'Imprímela o guárdala en PDF: trae un código QR para comprobar que es auténtica.'],
      requisitos: ['Es gratis y vale 30 días', 'Sirve para trámites de compraventa, alta o baja del vehículo'] },
  ],

  consejos: [
    ['cinturon', 'Cinturón siempre', 'Adelante y atrás. Es la medida que más vidas salva en un choque.'],
    ['nino', 'Niños atrás y en su silla', 'Los menores de 12 años viajan en el asiento trasero, con silla o cinturón según su edad.'],
    ['casco', 'Casco abrochado', 'Para quien maneja y para quien va de pasajero, aunque el viaje sea corto.'],
    ['celular', 'El celular, guardado', 'Una mirada al teléfono a 60 km/h son varios metros a ciegas.'],
    ['alcohol', 'Si tomas, no manejes', 'Pide un taxi o que alguien sobrio maneje. Conducir ebrio se castiga con arresto.'],
    ['peaton', 'El peatón primero', 'Haz alto total en los cruces y deja pasar, sobre todo a niños y personas mayores.'],
  ],

  preguntas: [
    ['¿Cómo sé si tengo multas?', 'Escribe tu placa o el folio de tu boleta en el buscador de esta página. Te mostramos cuánto debes hoy y hasta cuándo tienes descuento.'],
    ['¿Puedo pagar con tarjeta?', 'Sí. Toca "Pagar en línea" junto a tu multa: puedes pagar con tarjeta de crédito o débito, en OXXO o por transferencia SPEI, a través de Mercado Pago.'],
    ['¿El descuento aplica para todas las multas?', 'No. Las infracciones por conducir en estado de ebriedad se pagan completas. Para las demás, el descuento depende de cuántos días pasaron desde la boleta.'],
    ['Me retuvieron la licencia, ¿qué hago?', 'Paga tu multa y acude a la Dirección de Tránsito con tu recibo e identificación. Te devuelven el documento ese mismo día.'],
    ['¿Cómo sé si una boleta o un oficial son reales?', 'Las boletas, recibos, constancias y credenciales de los oficiales traen un código QR. Escanéalo con la cámara de tu celular: se abre una página oficial que confirma si es auténtico.'],
    ['No estoy de acuerdo con mi multa', 'Puedes presentar un recurso de revocación. Mientras se resuelve no tienes que pagarla. Revisa el trámite "Inconformarme con una multa".'],
  ],
};
