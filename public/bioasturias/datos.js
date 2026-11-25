/* BioAsturias · Panel — datos de ejemplo (TODO ficticio).
   Empresas, personas y correos inventados (dominios .example): el repo es público.
   Las fechas se calculan respecto a «hoy» en el navegador, así el brief siempre parece actual:
   BA_DATOS.base(hoy, ahora) devuelve las colecciones; los cambios de Mateo se guardan aparte (ver nucleo.js). */
'use strict';
window.BA_DATOS = (() => {
  const p2 = n => String(n).padStart(2, '0');
  const iso = d => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
  const addD = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const esLab = d => d.getDay() !== 0 && d.getDay() !== 6;
  const addL = (d, n) => { let x = new Date(d); const s = n < 0 ? -1 : 1; let k = Math.abs(n); while (k > 0) { x = addD(x, s); if (esLab(x)) k--; } return x; };
  const conHora = (d, hhmm) => { const [h, m] = hhmm.split(':').map(Number); const x = new Date(d); x.setHours(h, m, 0, 0); return x; };
  const slug = t => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '');

  // Generador pseudoaleatorio con semilla fija: los datos generados son siempre los mismos
  const rng = (() => { let a = 20261125; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })();
  const azar = lista => lista[Math.floor(rng() * lista.length)];

  // Áreas de trabajo de Mateo (reunión del 25-11) más «Internacional», que ya usaba el prototipo para la misión a México
  const AREAS = ['Proyectos', 'I+D', 'Socios', 'Eventos', 'Administración', 'Propuestas comerciales', 'Comunicación', 'Internacional'];
  const PROYECTOS = {
    'Captación de socios': 'Socios', 'Plan estratégico': 'Proyectos', 'Mentoring científicos': 'Proyectos', 'Bioincubadora': 'Proyectos',
    'Rediseño web y marca': 'Comunicación', 'Facturación y cuotas': 'Administración', 'Asamblea': 'Administración',
    'Misión México': 'Internacional', 'Talento Bio': 'Eventos', 'Healthtech Madrid': 'Eventos',
  };
  // Subproyectos (p. ej. Bioincubadora › Entregable 1); se pueden crear más desde cada tarea
  const SUBPROYECTOS = {
    'Bioincubadora': ['Entregable 1', 'Local'], 'Plan estratégico': ['Entrevistas', 'Documento final'], 'Misión México': ['Agenda', 'Viaje'],
  };

  const CATEGORIAS = [
    ...['Pleno derecho', 'Adherido', 'No socio', 'Posible socio'].map(nombre => ({ nombre, grupo: 'tipo' })),
    ...['Healthtech', 'Talento Bio', 'Medio ambiente', 'Agroalimentación', 'I+D', 'Diagnóstico', 'Terapias avanzadas', 'Bioinformática'].map(nombre => ({ nombre, grupo: 'tema' })),
    ...['Mentoring', 'Entrevista plan estratégico', 'Misión México', 'Junta directiva', 'Bioincubadora'].map(nombre => ({ nombre, grupo: 'etiqueta' })),
  ];

  // clave|nombre|tipo|ciudad|dominio|categorías
  const ENTIDADES_TXT = `vit|Vitalia Biosistemas|Empresa|Gijón|vitalia-bio.example|Pleno derecho,Healthtech,I+D
aur|Aurora Terapias Avanzadas|Empresa|Oviedo|aurora-terapias.example|Pleno derecho,Healthtech,Terapias avanzadas
pil|Piloña Diagnostics|Empresa|Oviedo|pilona-dx.example|Pleno derecho,Diagnóstico,Healthtech
cve|Cuenca Verde Bioenergía|Empresa|Avilés|cuencaverde.example|Adherido,Medio ambiente
sab|Sablón Bioinformática|Empresa|Gijón|sablon-bio.example|Pleno derecho,Bioinformática,I+D
neu|Neurogaia Labs|Empresa|Oviedo|neurogaia.example|Adherido,Healthtech,I+D,Talento Bio
qui|Quimera Agroalimentaria|Empresa|Villaviciosa|quimera-agro.example|Adherido,Agroalimentación
bfn|Bioflora del Norte|Empresa|Llanera|bioflora-norte.example|Pleno derecho,Agroalimentación,Medio ambiente
enz|Enzimas Peñamayor|Empresa|Mieres|enzimas-penamayor.example|Pleno derecho,I+D,Talento Bio
cri|Cristalia Proteómica|Empresa|Gijón|cristalia.example|Pleno derecho,I+D,Diagnóstico
hor|Hórreo Nutrigenómica|Empresa|Cangas de Onís|horreo-nutri.example|Adherido,Agroalimentación
sel|Selene Medtech|Empresa|Oviedo|selene-medtech.example|Adherido,Healthtech
rib|Ribera Biomateriales|Empresa|Avilés|ribera-bio.example|Pleno derecho,I+D,Medio ambiente
can|Cantera Marina Biotech|Empresa|Luarca|cantera-marina.example|Adherido,Medio ambiente,Agroalimentación
ata|Atalaya Salud Digital|Empresa|Gijón|atalaya-salud.example|Pleno derecho,Healthtech
mir|Mirador Cardiotech|Empresa|Oviedo|mirador-cardio.example|Posible socio,Healthtech
lad|Ladera Genómica|Empresa|Siero|ladera-genomica.example|Posible socio,I+D,Diagnóstico
fag|Fagedo Cosmética Natural|Empresa|Pola de Lena|fagedo.example|Posible socio,Medio ambiente
itb|Instituto Tecnológico Biocosta|Centro tecnológico|Gijón|biocosta.example|Pleno derecho,I+D,Talento Bio
cab|Centro Tecnológico Ágora Biomédica|Centro tecnológico|Oviedo|agora-biomedica.example|Pleno derecho,Healthtech,I+D
uve|Universidad de Vetusta · Facultad de Ciencias|Universidad|Oviedo|uvetusta.example|Pleno derecho,Talento Bio,I+D
uvt|Universidad de Vetusta · Escuela de Doctorado|Universidad|Oviedo|doctorado.uvetusta.example|Adherido,Talento Bio
ari|Agencia Regional de Innovación Norte|Administración|Oviedo|ari-norte.example|No socio
ayv|Ayuntamiento de Vetusta · Promoción Económica|Administración|Oviedo|ayto-vetusta.example|No socio
fhv|Fundación Hospitalaria de Vetusta|Hospital / Fundación|Oviedo|fhvetusta.example|Adherido,Healthtech`;

  // entidad|nombre|apellidos|cargo|P = principal|categorías propias
  const CONTACTOS_TXT = `vit|Francisco|Llera Mestres|Director general|P|Junta directiva,Misión México
vit|Marta|Quirós Alonso|Directora de I+D||
vit|Íñigo|Ardura Solís|Responsable de calidad||
aur|Carmen|Bernardo Toral|CEO|P|Junta directiva,Entrevista plan estratégico
aur|Rubén|Cienfuegos Vigil|Director científico||Terapias avanzadas
aur|Mario|Bustiello Prieto|Responsable de calidad||
pil|Alejandro|Montes Barredo|Gerente|P|Entrevista plan estratégico
pil|Lorena|Faes Canel|Responsable comercial||
pil|Rocío|Alles Sela|||
cve|Pelayo|Ordiales Suárez|Director|P|
cve|Noelia|Amandi Rubio|Técnica de proyectos||
sab|Irene|Sotrondio Pando|CEO|P|Misión México
sab|Héctor|Bimenes Lago|CTO||
sab|Aitana|Rozada Cueto|||
neu|Gonzalo|Fano Marcos|Fundador|P|Bioincubadora
neu|Beatriz|Cuervo Linares|Directora de operaciones||
qui|Covadonga|Laviana Peña|Gerente|P|
qui|Samuel|Arbesú Fano|Responsable de innovación||
bfn|Tomás|Roces Villar|Director general|P|Junta directiva,Entrevista plan estratégico
bfn|Estela|Cangas Meana|Responsable de I+D+i||
bfn|Ramiro|Collado Sierra|Responsable de exportación||Misión México
enz|Adrián|Pumarín Cobián|CEO|P|
enz|Silvia|Entralgo Mori|Directora técnica||
cri|Natalia|Quintana Orviz|Directora|P|Junta directiva
cri|Víctor|Argüelles Roza|Jefe de laboratorio||
cri|Leire|Mones Haces|Gestora de proyectos||Mentoring
hor|Olaya|Mon Sierra|Gerente|P|
hor|Marcos|Villamil Ardisana|||
sel|Raquel|Foncubierta Lastra|CEO|P|
sel|Diego|Tamés Brañas|Director comercial||
rib|Jorge|Cabranes Fidalgo|Director general|P|Misión México
rib|Paula|Sama Cortina|Responsable de proyectos||
can|Ángela|Pravia Gayo|Gerente|P|
can|Ismael|Busto Trelles|Técnico de laboratorio||
ata|Sergio|Pereda Naves|CEO|P|Misión México
ata|Clara|Bernueces Soto|Product owner||
ata|Hugo|Candás Zarracina|CTO||
ata|Nerea|Fanjul Ortea|Responsable de marketing||
mir|Lucía|Anes Moro|Fundadora|P|Bioincubadora
mir|Pablo|Argandona Villa|Director financiero||
lad|Daniel|Cabo Ferrao|Director|P|
lad|Sandra|Güerta Lorences|Directora científica||
fag|Eva|Priañes Díaz|Gerente|P|
itb|Luis|Ceñal Arango|Director general|P|Junta directiva,Entrevista plan estratégico,Bioincubadora
itb|Mercedes|Naveda Puente|Responsable de transferencia||
itb|Pablo|Corao Escalada|Investigador principal||Mentoring
cab|Elena|Ablanedo Tuero|Directora|P|Entrevista plan estratégico,Bioincubadora
cab|Rafael|Tiñana Huerta|Responsable de proyectos europeos||
uve|Andrés|Folgueras Belmonte|Decano|P|Entrevista plan estratégico
uve|Teresa|Santullano Mon|Coordinadora de doctorado||Mentoring
uve|Javier|Cadavieco Menéndez|Responsable de prácticas||
uvt|Mónica|Llaneza Ruiz|Directora|P|Mentoring
uvt|Fernando|Llavona Pis|Profesor||Mentoring
ari|Cristina|Alvargonzález Fresno|Directora general|P|Misión México,Entrevista plan estratégico
ari|Julián|Villaverde Sela|Técnico de innovación||
ari|Marina|Prado Rendueles|Gestión de ayudas||Mentoring
ayv|Rodrigo|Piñera Gallego|Concejal de promoción económica|P|Bioincubadora
ayv|Sonia|Cueli Argüello|Técnica de proyectos||
fhv|Ramón|Valdés Quirós|Jefe de investigación|P|Healthtech
fhv|Alba|Tolivia Cuesta|Gestora de innovación||`;

  // Evaluación simple de filtros (bloques unidos por Y, categorías de cada bloque por O) para los envíos de ejemplo
  const cumple = (cats, bloques) => bloques.every(b => b.some(c => cats.includes(c)));

  function base(hoy, ahora) {
    hoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    const ref = esLab(hoy) ? hoy : addL(hoy, 1);
    const ultLab = addL(hoy, -1);
    const ini = conHora(ultLab, '18:00');
    let fin = conHora(hoy, '06:00'); if (ahora < fin) fin = ahora;
    if (fin < ini) fin = new Date(ini.getTime() + 3600e3);
    const enVentana = f => new Date(ini.getTime() + f * (fin - ini)).toISOString();
    const atras = (n, h) => conHora(addL(ref, -n), h).toISOString();
    const dl = n => iso(addL(ref, n));

    // ---- entidades y contactos ----
    const entidades = ENTIDADES_TXT.split('\n').map(l => {
      const [k, nombre, tipo, ciudad, dom, cats] = l.split('|');
      return { id: 'e-' + k, nombre, tipo, ciudad, web: 'www.' + dom, dominio: dom, cats: cats.split(','), notas: '' };
    });
    const entPorClave = Object.fromEntries(entidades.map(e => [e.id.slice(2), e]));
    const contactos = CONTACTOS_TXT.split('\n').map((l, i) => {
      const [k, nombre, apellidos, cargo, pr, extra] = l.split('|');
      const e = entPorClave[k];
      return {
        id: 'c' + p2(i + 1), entidadId: e.id, nombre, apellidos, cargo: cargo || '', principal: pr === 'P',
        email: `${slug(nombre)}.${slug(apellidos.split(' ')[0])}@${e.dominio}`,
        tel: '9' + (85 + (i % 3)) + ' ' + p2(10 + (i * 7) % 80) + ' ' + p2(20 + (i * 11) % 70) + ' ' + p2(10 + (i * 13) % 80),
        cats: extra ? extra.split(',') : [],
      };
    });
    const nombreC = c => `${c.nombre} ${c.apellidos}`;
    const buscarC = t => contactos.find(c => nombreC(c).startsWith(t));
    const cid = t => { const c = buscarC(t); if (!c) throw new Error('Contacto no encontrado: ' + t); return c.id; };
    const catsDe = c => [...new Set([...c.cats, ...entidades.find(e => e.id === c.entidadId).cats])];

    // ---- elementos del brief ----
    // nivel 2: día normal y cargado; nivel 3: solo día cargado. En «día tranquilo» no hay ninguno.
    const items = [];
    const I = (id, nivel, fuente, grupo, titulo, quien, proyecto, extracto, o = {}) => {
      const it = {
        id, nivel, fuente, grupo, titulo, proyecto: proyecto || '', area: o.area || PROYECTOS[proyecto] || '', extracto,
        contactoId: null, entidadId: null, externo: '', meta: o.meta || [], estado: o.estado || 'abierto',
        llegada: o.f !== undefined ? enVentana(o.f) : atras(o.l ?? 1, o.h || '10:15'),
        vence: o.v !== undefined ? dl(o.v) : null, tareaId: o.tarea || null, ...(o.u ? { urgente: true } : {}), dir: o.dir || (fuente === 'outlook' ? 'in' : fuente),
      };
      if (quien) {
        if (quien[0] === '!') it.externo = quien.slice(1);
        else if (quien[0] === '@') it.entidadId = 'e-' + quien.slice(1);
        else { const c = buscarC(quien); if (!c) throw new Error('Contacto no encontrado: ' + quien); it.contactoId = c.id; it.entidadId = c.entidadId; }
      }
      items.push(it);
    };

    // — Día normal —
    I('i-cve-pleno', 2, 'outlook', 'sin_responder', 'Re: Pasar de adherido a socio de pleno derecho', 'Pelayo Ordiales', 'Captación de socios',
      'Hola Mateo: hemos hablado en el consejo y nos interesa saber qué cambia exactamente si pasamos a socios de pleno derecho (cuota, voto en asamblea, acceso a la Bioincubadora). ¿Podrías mandarnos una comparativa antes del viernes? Un abrazo, Pelayo.', { f: 0.12, meta: [['Estado', 'Leído, sin contestar']] });
    I('i-ari-just', 2, 'outlook', 'sin_responder', 'Justificación del mentoring: documentación pendiente', 'Cristina Alvargonzález', 'Mentoring científicos',
      'Buenos días, Mateo. Para cerrar la justificación de la subvención del programa de mentoring nos faltan las hojas de firmas de las sesiones 3 y 4 y el desglose de horas de los mentores. El plazo de entrega es el próximo jueves. Saludos, Cristina.', { f: 0.3, v: 2, meta: [['Adjuntos', 'Modelo de justificación.xlsx']] });
    I('i-cri-voto', 2, 'outlook', 'sin_responder', 'Convocatoria de asamblea: ¿puedo delegar el voto?', 'Natalia Quintana', 'Asamblea',
      'Mateo, no podré asistir a la asamblea del día 16. ¿Puedo delegar mi voto en Francisco Llera? ¿Hay que enviar algún documento firmado? Gracias.', { f: 0.45 });
    I('i-cab-entrev', 2, 'outlook', 'sin_responder', 'Entrevista plan estratégico: propongo dos huecos', 'Elena Ablanedo', 'Plan estratégico',
      'Hola Mateo. Para la entrevista del plan estratégico me vienen bien el martes a las 12:00 o el jueves a las 9:30. Si prefieres que sea en el centro, te enseño también el nuevo laboratorio. Elena.', { f: 0.52 });
    I('i-lad-visita', 2, 'outlook', 'sin_responder', 'Visita a Ladera Genómica: fechas', 'Daniel Cabo', 'Captación de socios',
      'Mateo, gracias por la propuesta de venir a conocernos. Podemos recibiros el miércoles o el viernes de la semana que viene por la mañana. Te enseñamos la planta y charlamos de lo que ofrece BioAsturias a una empresa como la nuestra.', { f: 0.6, l: 0 });
    I('i-uvt-feria', 2, 'outlook', 'sin_responder', 'Feria Talento Bio: stand de la Escuela de Doctorado', 'Mónica Llaneza', 'Talento Bio',
      'Buenas, Mateo. Nos gustaría tener un stand pequeño en la feria Talento Bio para presentar los programas de doctorado industrial. ¿Qué medidas tiene cada stand y cuál es el plazo para reservarlo?', { f: 0.7 });
    I('i-ata-ponentes', 2, 'outlook', 'sin_responder', 'Healthtech Madrid: ponentes de Atalaya', 'Sergio Pereda', 'Healthtech Madrid',
      'Hola Mateo. Clara y yo podríamos hablar 15 minutos sobre salud digital en el evento de Madrid. Te paso un par de títulos posibles para que veas si encajan en el programa.', { l: 2, h: '17:40' });
    I('i-ayv-local', 2, 'outlook', 'sin_responder', 'Local para la Bioincubadora: visita técnica', 'Rodrigo Piñera', 'Bioincubadora',
      'Mateo, tenemos disponible la planta baja del edificio que comentamos. Si os parece, la visita técnica podría ser la semana próxima con vuestro arquitecto. Dime fechas y lo coordino. Rodrigo.', { l: 6, h: '12:05', meta: [['Estado', 'Leído hace 6 días, sin contestar']] });
    I('i-env-mir', 2, 'outlook', 'esperando', 'Propuesta de asociación enviada a Mirador Cardiotech', 'Lucía Anes', 'Captación de socios',
      'Enviado por ti: «Hola Lucía, adjunto la propuesta de asociación con las cuotas y servicios. Si quieres, la comentamos en una visita. Un saludo, Mateo». Sin respuesta desde hace 6 días.', { dir: 'out', l: 6, h: '11:20', meta: [['Adjuntos', 'Propuesta asociación BioAsturias.pdf']] });
    I('i-env-faro', 2, 'outlook', 'esperando', 'Presupuesto del rediseño web y branding', '!Estudio Faro Creativo', 'Rediseño web y marca',
      'Enviado por ti: «Os paso el briefing y las referencias. ¿Podéis mandarme un presupuesto por fases (marca, web y guía de estilo)?». Sin respuesta desde hace 5 días.', { dir: 'out', l: 5, h: '09:50', u: true, meta: [['Para', 'hola@estudiofaro.example']] });
    I('i-env-fhv', 2, 'outlook', 'esperando', 'Pilotos de salud digital con la Fundación Hospitalaria', 'Ramón Valdés', 'Healthtech Madrid',
      'Enviado por ti: «Ramón, ¿te encaja que presentemos en Madrid los dos pilotos de salud digital del hospital? Necesitaríamos tu visto bueno y un contacto de comunicación».', { dir: 'out', l: 4, h: '16:10' });
    I('i-env-ari', 2, 'outlook', 'esperando', 'Memoria técnica del mentoring enviada a la Agencia', 'Marina Prado', 'Mentoring científicos',
      'Enviado por ti: «Marina, te adjunto la memoria técnica del programa. ¿Puedes confirmarme la recepción?». Sin acuse de recibo.', { dir: 'out', l: 3, h: '18:25', meta: [['Adjuntos', 'Memoria técnica mentoring.pdf']] });
    I('i-env-rib', 2, 'outlook', 'esperando', 'Agenda de la misión a México: confirmación de Ribera', 'Jorge Cabranes', 'Misión México',
      'Enviado por ti: «Jorge, te paso la agenda provisional de la misión. Necesito que confirmes si viajáis dos personas y qué días podéis».', { dir: 'out', l: 4, h: '12:30' });
    I('i-odoo-qui', 2, 'odoo', 'novedad', 'Cuota anual impagada: Quimera Agroalimentaria', '@qui', 'Facturación y cuotas',
      'La factura de la cuota anual de socio adherido vence hoy y sigue sin cobrar. Es el primer vencimiento sin pago de este cliente.', { f: 0.9, v: 0, meta: [['Factura', 'F-2026-0148'], ['Importe', '1.200,00 €'], ['Estado', 'Pendiente de cobro'], ['Vencimiento', 'Hoy']] });
    I('i-od-viab', 2, 'onedrive', 'novedad', 'Entregable «Informe de viabilidad v3» de la Bioincubadora', '@cab', 'Bioincubadora',
      'El borrador del informe de viabilidad debe entregarse hoy al comité. Última edición ayer por la tarde; faltan las conclusiones y el anexo económico.', { f: 0.2, v: 0, meta: [['Ruta', 'OneDrive / Bioincubadora / Entregables'], ['Archivo', 'Informe de viabilidad v3.docx']] });
    I('i-sub-plazo', 2, 'outlook', 'novedad', 'Plazo de la solicitud de ayuda para el programa de mentoring', 'Julián Villaverde', 'Mentoring científicos',
      'Recordatorio: la solicitud de la segunda anualidad se cierra el viernes a las 14:00 en la sede electrónica. Os adelanto que han añadido un campo nuevo de indicadores.', { f: 0.58, v: 3 });
    I('i-odoo-prov', 2, 'odoo', 'novedad', 'Factura de proveedor por vencer: imprenta de la feria', '!Imprenta Cantabria Digital', 'Talento Bio',
      'Factura del material impreso de la feria (carteles y roll-ups) con vencimiento próximo. Pendiente de tu visto bueno antes de pagar.', { f: 0.4, v: 4, meta: [['Factura', 'P-2026-0392'], ['Importe', '684,20 €'], ['Estado', 'Pendiente de aprobar']] });
    I('i-catering', 2, 'outlook', 'sin_responder', 'Catering de la feria Talento Bio: confirmar menú', '!Catering Los Fresnos', 'Talento Bio',
      'Buenas, Mateo: para reservar la fecha necesitamos que nos confirmes el menú (coffee y comida ligera para 80 personas) antes del jueves.', { f: 0.65, v: 2 });
    I('i-od-plan', 2, 'onedrive', 'novedad', 'Plan estratégico · borrador v4: comentarios nuevos', 'Elena Ablanedo', 'Plan estratégico',
      'Elena ha dejado 6 comentarios en el capítulo de «Capacidades científicas». Propone reordenar los retos y añadir un anexo con las entrevistas realizadas.', { f: 0.25, meta: [['Ruta', 'OneDrive / Plan estratégico / Borradores'], ['Archivo', 'Plan estratégico sector biotecnológico v4.docx'], ['Cambios', '6 comentarios, 2 secciones editadas']] });
    I('i-gd-mentores', 2, 'gdrive', 'novedad', 'Seguimiento de mentores: 3 filas nuevas', 'Teresa Santullano', 'Mentoring científicos',
      'Teresa ha añadido tres candidaturas de científicos a la hoja de seguimiento y marcado dos mentores como «confirmados».', { f: 0.35, meta: [['Ruta', 'Drive compartido / Mentoring / Seguimiento'], ['Archivo', 'Seguimiento de mentores.xlsx']] });
    I('i-odoo-sab', 2, 'odoo', 'novedad', 'Pago recibido: cuota de Sablón Bioinformática', '@sab', 'Facturación y cuotas',
      'Se ha registrado el cobro de la cuota anual de socio de pleno derecho por transferencia.', { f: 0.15, meta: [['Factura', 'F-2026-0131'], ['Importe', '2.400,00 €'], ['Estado', 'Cobrada']] });
    I('i-cal-healthtech', 2, 'calendario', 'novedad', 'Invitación nueva: comité del evento Healthtech Madrid', '@fhv', 'Healthtech Madrid',
      'Nueva invitación para el jueves a las 12:00 por videollamada con la Fundación Hospitalaria y Atalaya. Aún no la has aceptado.', { f: 0.5, meta: [['Cuándo', 'Jueves 12:00-13:00'], ['Dónde', 'Videollamada']] });
    I('i-cal-mueve', 2, 'calendario', 'novedad', 'Reunión movida: seguimiento con la Agencia Regional', '@ari', 'Mentoring científicos',
      'La reunión de mañana a las 10:00 se ha pasado a las 12:30 a petición de la Agencia. Comprueba que no se solapa con tu comité.', { f: 0.77, meta: [['Antes', 'Mañana 10:00'], ['Ahora', 'Mañana 12:30']] });
    I('i-od-brief', 2, 'onedrive', 'novedad', 'Briefing del rediseño web v2 subido', '!Estudio Faro Creativo', 'Rediseño web y marca',
      'Se ha subido «Briefing rediseño web v2.pdf» a la carpeta compartida. Incluye mapa de contenidos y tres referencias de estilo.', { f: 0.82, meta: [['Ruta', 'OneDrive / Rediseño web'], ['Archivo', 'Briefing rediseño web v2.pdf']] });
    I('i-gd-mx', 2, 'gdrive', 'novedad', 'Agenda de la Misión a México (borrador) compartida contigo', 'Irene Sotrondio', 'Misión México',
      'Irene te ha compartido el borrador de la agenda con visitas a tres centros de investigación y una jornada de networking en Ciudad de México.', { f: 0.4, meta: [['Ruta', 'Drive compartido / Misión México'], ['Archivo', 'Agenda misión México (borrador)']] });
    I('i-respuesta-sel', 2, 'outlook', 'novedad', 'Selene Medtech acepta ser ponente en Healthtech', 'Raquel Foncubierta', 'Healthtech Madrid',
      'Hola Mateo, confirmamos que Diego y yo participaremos en la mesa de tecnología sanitaria. Mándanos los datos de la sede cuando los tengas.', { f: 0.88, meta: [['Estado', 'No requiere respuesta urgente']] });
    I('i-odoo-ata', 2, 'odoo', 'novedad', 'Cuota pendiente 30 días: Atalaya Salud Digital', '@ata', 'Facturación y cuotas',
      'La cuota de 2026 lleva 30 días vencida. Odoo ha enviado ya el recordatorio automático; queda pendiente tu llamada si lo ves oportuno.', { f: 0.1, meta: [['Factura', 'F-2026-0119'], ['Importe', '2.400,00 €'], ['Estado', 'Vencida 30 días']] });

    // — Solo día cargado —
    I('i-vit-iso', 3, 'outlook', 'sin_responder', 'Duda sobre la certificación de calidad en el informe del sector', 'Íñigo Ardura', 'Plan estratégico',
      'Mateo, en el borrador del informe aparecemos con una certificación que aún estamos tramitando. ¿Podemos matizar el texto? Te adjunto cómo lo diríamos.', { f: 0.18 });
    I('i-sel-ponente', 3, 'outlook', 'sin_responder', 'Selene Medtech: datos de la sede de Madrid', 'Diego Tamés', 'Healthtech Madrid',
      'Hola, ¿nos podéis decir en qué sala será la mesa y si hay pantalla para demos en directo?', { f: 0.55 });
    I('i-uve-cand', 3, 'outlook', 'sin_responder', 'Candidaturas de mentoring: cuatro nuevas', 'Teresa Santullano', 'Mentoring científicos',
      'Mateo, te adjunto los currículos de cuatro doctorandos que quieren entrar en el programa. ¿Les asignamos mentor esta semana?', { f: 0.4, meta: [['Adjuntos', '4 currículos (PDF)']] });
    I('i-fhv-sala', 3, 'outlook', 'sin_responder', 'Sala para el evento Healthtech: ¿confirmada?', 'Alba Tolivia', 'Healthtech Madrid',
      'Buenos días. Seguimos esperando que confirméis el aforo para reservar la sala del hospital. Hay otra petición para esa fecha.', { l: 3, h: '13:00' });
    I('i-neu-incub', 3, 'outlook', 'sin_responder', 'Interés en la Bioincubadora para una spin-off', 'Gonzalo Fano', 'Bioincubadora',
      'Estamos pensando en crear una spin-off y nos interesa un espacio en la Bioincubadora. ¿Cuándo se abre la convocatoria y qué requisitos hay?', { f: 0.68 });
    I('i-ari-ayudas', 3, 'outlook', 'sin_responder', 'Convocatoria de ayudas de I+D: ¿la difundís entre los socios?', 'Julián Villaverde', 'Captación de socios',
      'Os pasamos la convocatoria de proyectos colaborativos de I+D. Si la enviáis a vuestros socios, mejor; el plazo cierra en un mes.', { l: 2, h: '10:40' });
    I('i-bfn-contacto', 3, 'outlook', 'sin_responder', 'Cambio de contacto en Bioflora del Norte', 'Estela Cangas', 'Captación de socios',
      'Mateo, a partir de ahora la persona de contacto para exportación será Ramiro Collado. Por favor, actualiza vuestra lista.', { f: 0.8 });
    I('i-env-sel', 3, 'outlook', 'esperando', 'Propuesta de patrocinio de Talento Bio a Selene Medtech', 'Diego Tamés', 'Talento Bio',
      'Enviado por ti: «Diego, te paso el dossier de patrocinio con los tres niveles». Sin respuesta desde hace 7 días.', { dir: 'out', l: 7, h: '10:00' });
    I('i-env-fag', 3, 'outlook', 'esperando', 'Invitación a conocer BioAsturias a Fagedo Cosmética Natural', 'Eva Priañes', 'Captación de socios',
      'Enviado por ti: «Eva, me encantaría visitaros y contaros qué hacemos». Sin respuesta desde hace 8 días.', { dir: 'out', l: 8, h: '09:30' });
    I('i-env-faro2', 3, 'outlook', 'esperando', 'Segunda propuesta de logotipo', '!Estudio Faro Creativo', 'Rediseño web y marca',
      'Enviado por ti: «Hemos visto las tres propuestas; nos quedamos con la B pero con otra tipografía». Pendiente de que preparen la versión nueva.', { dir: 'out', l: 4, h: '19:05' });
    I('i-env-uvt', 3, 'outlook', 'esperando', 'Convenio de prácticas con la Escuela de Doctorado', 'Fernando Llavona', 'Mentoring científicos',
      'Enviado por ti: «Fernando, te adjunto el borrador del convenio para las prácticas de los mentorizados». Sin respuesta.', { dir: 'out', l: 5, h: '15:45', meta: [['Adjuntos', 'Borrador convenio prácticas.docx']] });
    I('i-odoo-can', 3, 'odoo', 'novedad', 'Cuota por vencer esta semana: Cantera Marina Biotech', '@can', 'Facturación y cuotas',
      'La cuota de socio adherido vence en dos días. Aún no consta pago.', { f: 0.33, v: 2, meta: [['Factura', 'F-2026-0152'], ['Importe', '1.200,00 €'], ['Estado', 'Pendiente de cobro']] });
    I('i-od-memoria', 3, 'onedrive', 'novedad', 'Memoria técnica del mentoring: faltan 2 apartados', '@ari', 'Mentoring científicos',
      'La memoria final debe presentarse en tres días. En el documento quedan sin completar «Resultados» y «Lecciones aprendidas».', { f: 0.47, v: 3, meta: [['Ruta', 'OneDrive / Mentoring / Justificación'], ['Archivo', 'Memoria final mentoring.docx']] });
    I('i-expo', 3, 'outlook', 'novedad', 'Talento Bio: fecha límite para expositores', '@itb', 'Talento Bio',
      'El Instituto Tecnológico Biocosta pide cerrar la lista de expositores el viernes para imprimir el plano de la feria.', { f: 0.62, v: 3 });
    I('i-gd-pres', 3, 'gdrive', 'novedad', 'Presupuesto de la Misión a México actualizado', 'Jorge Cabranes', 'Misión México',
      'Jorge ha actualizado la hoja de costes (vuelos, alojamiento, traductor). Total estimado: 18.400 € para 6 personas.', { f: 0.72, meta: [['Ruta', 'Drive compartido / Misión México'], ['Archivo', 'Presupuesto misión.xlsx']] });
    I('i-odoo-viaje', 3, 'odoo', 'novedad', 'Factura de proveedor registrada: agencia de viajes', '!Agencia Horizontes', 'Misión México',
      'Se ha registrado una factura de proveedor por los vuelos de la misión. Pendiente de asignar al proyecto.', { f: 0.85, meta: [['Factura', 'P-2026-0401'], ['Importe', '5.870,00 €'], ['Estado', 'Sin asignar a proyecto']] });
    I('i-od-actas', 3, 'onedrive', 'novedad', 'Actas de la asamblea anterior: borrador listo para revisar', '@itb', 'Asamblea',
      'Se ha subido el borrador del acta de la última asamblea. Hay que revisarlo antes de enviarlo con la convocatoria.', { f: 0.3, meta: [['Ruta', 'OneDrive / Asambleas / 2026'], ['Archivo', 'Acta asamblea (borrador).docx']] });
    I('i-cal-visita', 3, 'calendario', 'novedad', 'Reunión cancelada: visita de Ladera Genómica', '@lad', 'Captación de socios',
      'Ladera ha cancelado la visita del jueves. Proponen reprogramar la semana que viene.', { f: 0.6 });
    I('i-cal-comite', 3, 'calendario', 'novedad', 'Recordatorio: comité de la Bioincubadora el viernes', '@ayv', 'Bioincubadora',
      'Recordatorio automático. Tienes que llevar el informe de viabilidad.', { f: 0.9 });
    I('i-odoo-pil', 3, 'odoo', 'novedad', 'Pago recibido: Piloña Diagnostics', '@pil', 'Facturación y cuotas',
      'Cobrada la cuota anual por transferencia.', { f: 0.05, meta: [['Factura', 'F-2026-0126'], ['Importe', '2.400,00 €'], ['Estado', 'Cobrada']] });
    I('i-rebotes', 3, 'outlook', 'novedad', 'Tres correos del envío «Healthtech Madrid» han rebotado', '@ata', 'Healthtech Madrid',
      'Outlook ha devuelto tres mensajes de tu último envío por dirección inexistente. Conviene revisar esos contactos en el CRM.', { f: 0.95, meta: [['Estado', 'Rebotados: 3']] });
    // Ya convertidos en tarea (enlazan con el tablero)
    I('i-t-1', 2, 'outlook', 'sin_responder', 'Propuesta de colaboración con el Centro Ágora', 'Rafael Tiñana', 'Plan estratégico', 'Rafael pide una reunión para coordinar los proyectos europeos con el plan estratégico.', { l: 3, estado: 'tarea', tarea: 't05' });
    I('i-t-2', 2, 'outlook', 'sin_responder', 'Lista de ponentes confirmados para Talento Bio', 'Mercedes Naveda', 'Talento Bio', 'Mercedes envía la lista provisional de ponentes del Instituto.', { l: 5, estado: 'tarea', tarea: 't08' });
    I('i-t-3', 2, 'outlook', 'sin_responder', 'Cuota de nuevos socios: tabla comparativa', 'Pelayo Ordiales', 'Captación de socios', 'Solicitan comparativa de cuotas y servicios.', { l: 4, estado: 'tarea', tarea: 't02' });

    // ---- agenda de hoy (m: 1 tranquilo+normal+cargado, 2 normal+cargado, 3 solo cargado) ----
    const agenda = esLab(hoy) ? [
      { id: 'a1', m: 2, ini: '09:30', fin: '10:30', titulo: 'Seguimiento del plan estratégico', con: 'Elena Ablanedo', lugar: 'Videollamada', proyecto: 'Plan estratégico' },
      { id: 'a2', m: 2, ini: '11:30', fin: '12:00', titulo: 'Llamada sobre la justificación del mentoring', con: 'Cristina Alvargonzález', lugar: 'Teléfono', proyecto: 'Mentoring científicos' },
      { id: 'a3', m: 3, ini: '12:15', fin: '12:45', titulo: 'Llamada con el estudio de diseño', con: 'Estudio Faro Creativo', lugar: 'Videollamada', proyecto: 'Rediseño web y marca' },
      { id: 'a4', m: 2, ini: '13:00', fin: '14:00', titulo: 'Visita a Mirador Cardiotech (captación)', con: 'Lucía Anes', lugar: 'Oviedo, sede de Mirador', proyecto: 'Captación de socios' },
      { id: 'a5', m: 1, ini: '16:30', fin: '17:30', titulo: 'Comité de la Bioincubadora', con: 'Rodrigo Piñera, Luis Ceñal', lugar: 'Sala de juntas, Ayuntamiento', proyecto: 'Bioincubadora' },
      { id: 'a6', m: 3, ini: '18:00', fin: '18:45', titulo: 'Preparación de la misión a México', con: 'Irene Sotrondio, Jorge Cabranes', lugar: 'Videollamada', proyecto: 'Misión México' },
    ] : [];

    // ---- tareas ----
    const T = (id, titulo, proyecto, v, prioridad, estado, origenId = null, area) => ({ id, titulo, proyecto, area: area || PROYECTOS[proyecto] || 'Proyectos', fecha: dl(v), prioridad, estado, origenId, notas: '' });
    const tareas = [
      T('t01', 'Revisar el capítulo de retos del plan estratégico', 'Plan estratégico', 1, 'alta', 'encurso', 'i-od-plan'),
      T('t02', 'Enviar a Cuenca Verde la comparativa pleno derecho / adherido', 'Captación de socios', 2, 'media', 'porhacer', 'i-t-3'),
      T('t03', 'Completar la memoria técnica del mentoring', 'Mentoring científicos', 2, 'alta', 'encurso', 'i-od-memoria'),
      T('t04', 'Cerrar la agenda de la misión a México con las empresas', 'Misión México', 5, 'alta', 'encurso', 'i-gd-mx'),
      T('t05', 'Reunión con el Centro Ágora sobre proyectos europeos', 'Plan estratégico', 4, 'media', 'porhacer', 'i-t-1'),
      T('t06', 'Revisar propuestas de logotipo con el estudio', 'Rediseño web y marca', 3, 'media', 'porhacer', 'i-env-faro2'),
      T('t07', 'Preparar la convocatoria de la asamblea y el orden del día', 'Asamblea', 6, 'alta', 'porhacer'),
      T('t08', 'Cerrar la lista de ponentes de Talento Bio', 'Talento Bio', 5, 'media', 'porhacer', 'i-t-2'),
      T('t09', 'Llamar a Quimera por la cuota impagada', 'Facturación y cuotas', 0, 'alta', 'porhacer', 'i-odoo-qui'),
      T('t10', 'Asignar la factura de vuelos al proyecto de México', 'Misión México', 3, 'baja', 'porhacer', 'i-odoo-viaje'),
      T('t11', 'Entrevistar a Tomás Roces para el plan estratégico', 'Plan estratégico', 7, 'media', 'porhacer'),
      T('t12', 'Entrevistar a Alejandro Montes para el plan estratégico', 'Plan estratégico', 9, 'media', 'porhacer'),
      T('t13', 'Terminar el informe de viabilidad de la Bioincubadora', 'Bioincubadora', 0, 'alta', 'encurso', 'i-od-viab'),
      T('t14', 'Visita comercial a Ladera Genómica', 'Captación de socios', 8, 'media', 'porhacer', 'i-lad-visita'),
      T('t15', 'Enviar el programa preliminar de Healthtech Madrid a los ponentes', 'Healthtech Madrid', 6, 'media', 'porhacer'),
      T('t16', 'Asignar mentor a los 4 doctorandos nuevos', 'Mentoring científicos', 4, 'media', 'porhacer', 'i-uve-cand'),
      T('t17', 'Elegir el menú de la feria Talento Bio', 'Talento Bio', 2, 'baja', 'hecho', 'i-catering'),
      T('t18', 'Subir la agenda de la misión al Drive compartido', 'Misión México', -2, 'baja', 'hecho'),
      T('t19', 'Enviar la convocatoria de entrevistas a los socios clave', 'Plan estratégico', -3, 'media', 'hecho'),
      T('t20', 'Contratar el catering de la feria', 'Talento Bio', -4, 'media', 'hecho'),
      T('t21', 'Conciliar las cuotas de octubre en Odoo', 'Facturación y cuotas', -5, 'media', 'hecho'),
      T('t22', 'Reunión de arranque del rediseño web', 'Rediseño web y marca', -6, 'alta', 'hecho'),
      T('t23', 'Solicitar a Hacienda el certificado de la fundación', 'Facturación y cuotas', 10, 'baja', 'porhacer', null, 'Administración'),
      T('t24', 'Actualizar la lista de socios tras los cambios de contacto', 'Captación de socios', 3, 'baja', 'porhacer', 'i-bfn-contacto', 'Socios'),
      T('t25', 'Preparar la nota de prensa del evento Healthtech', 'Healthtech Madrid', 12, 'baja', 'porhacer', null, 'Comunicación'),
      T('t26', 'Redactar las conclusiones del informe de viabilidad', 'Bioincubadora', 0, 'alta', 'porhacer'),
      T('t27', 'Cerrar el anexo económico del informe de viabilidad', 'Bioincubadora', 0, 'alta', 'porhacer'),
    ];
    const SUB_T = { t13: 'Entregable 1', t26: 'Entregable 1', t27: 'Entregable 1', t01: 'Documento final', t11: 'Entrevistas', t12: 'Entrevistas', t19: 'Entrevistas', t04: 'Agenda', t18: 'Agenda', t10: 'Viaje' };
    // Tipo de acción (matriz Hacer / Llamar / Ir / Contestar). «Ir» = desplazarse: visitas, reuniones presenciales, eventos.
    const ACC_T = { t02: 'contestar', t04: 'llamar', t05: 'ir', t08: 'contestar', t09: 'llamar', t11: 'ir', t12: 'ir', t14: 'ir', t20: 'llamar', t22: 'ir' };
    tareas.forEach(t => { t.sub = SUB_T[t.id] || ''; t.accion = ACC_T[t.id] || 'hacer'; });

    // ---- comunicaciones (historial) ----
    const comms = [];
    let nc = 0;
    const K = (dias, h, tipo, quien, asunto, resumen, proyecto = '') => {
      const c = quien[0] === '@' ? null : buscarC(quien);
      comms.push({ id: 'm' + (++nc), fecha: conHora(addD(hoy, -dias), h).toISOString(), tipo, asunto, resumen, proyecto,
        contactoId: c ? c.id : null, entidadId: c ? c.entidadId : 'e-' + quien.slice(1), fuente: tipo === 'reunion' ? 'calendario' : 'outlook' });
    };
    // Misión México
    K(2, '09:10', 'correo-enviado', 'Irene Sotrondio', 'Misión a México: agenda provisional', 'Te paso la agenda provisional con las tres visitas y la jornada de networking. ¿Puedes revisar los tiempos de traslado?', 'Misión México');
    K(5, '12:40', 'reunion', 'Jorge Cabranes', 'Reunión preparatoria Misión México', 'Revisamos qué empresas viajan, los objetivos comerciales y el presupuesto. Jorge viajaría con una persona de ventas.', 'Misión México');
    K(8, '17:20', 'correo-recibido', 'Francisco Llera', 'Re: Misión México · interés de Vitalia', 'Nos apuntamos a la misión con dos personas. Nos interesa especialmente la visita al centro de terapias avanzadas.', 'Misión México');
    K(11, '10:00', 'correo-enviado', 'Cristina Alvargonzález', 'Apoyo de la Agencia a la misión a México', 'Os pedimos apoyo institucional y cartas de presentación para las reuniones con las autoridades locales.', 'Misión México');
    K(14, '16:00', 'correo-recibido', 'Cristina Alvargonzález', 'Re: Apoyo de la Agencia a la misión a México', 'Podemos facilitar los contactos con la oficina comercial y una carta de apoyo. Necesitamos la lista de empresas.', 'Misión México');
    K(16, '11:30', 'correo-recibido', 'Sergio Pereda', 'Misión México · Atalaya', 'Atalaya participará. Queremos explorar socios para el piloto de telemedicina.', 'Misión México');
    K(21, '13:15', 'llamada', 'Ramiro Collado', 'Llamada sobre exportación a México', 'Ramiro cuenta que Bioflora ya ha vendido en el país; ofrece compartir contactos de distribuidores.', 'Misión México');
    // Mentoring
    K(1, '12:00', 'correo-recibido', 'Teresa Santullano', 'Mentores confirmados', 'Dos mentores más confirmados para el segundo trimestre. Falta asignar a los candidatos.', 'Mentoring científicos');
    K(6, '09:30', 'reunion', 'Marina Prado', 'Reunión de seguimiento de la subvención', 'Repasamos hitos, indicadores y la documentación pendiente de la justificación.', 'Mentoring científicos');
    K(9, '18:00', 'correo-enviado', 'Pablo Corao', 'Invitación a ser mentor', 'Te invitamos a ser mentor en el programa de este curso; supondría unas 12 horas.', 'Mentoring científicos');
    K(12, '10:45', 'correo-recibido', 'Pablo Corao', 'Re: Invitación a ser mentor', 'Acepto con mucho gusto. Puedo hacerme cargo de dos mentorizados.', 'Mentoring científicos');
    K(18, '16:10', 'reunion', 'Mónica Llaneza', 'Sesión 3 del programa de mentoring', 'Sesión con 14 doctorandos, buena asistencia. Se recogieron las hojas de firmas.', 'Mentoring científicos');
    K(25, '12:20', 'correo-recibido', 'Leire Mones', 'Perfil de Cristalia para mentoría industrial', 'Cristalia ofrece acoger a dos científicos en prácticas de observación en el laboratorio.', 'Mentoring científicos');
    // Plan estratégico
    K(3, '17:00', 'reunion', 'Carmen Bernardo', 'Entrevista plan estratégico', 'Entrevista de 45 minutos: retos de financiación, talento y escalado internacional de las terapias avanzadas.', 'Plan estratégico');
    K(10, '11:00', 'reunion', 'Luis Ceñal', 'Entrevista plan estratégico', 'Habló de transferencia tecnológica y de la necesidad de infraestructuras compartidas.', 'Plan estratégico');
    K(13, '15:30', 'correo-enviado', 'Andrés Folgueras', 'Entrevista para el plan estratégico', 'Te escribo para proponerte una entrevista de media hora sobre la formación científica en la región.', 'Plan estratégico');
    K(20, '10:10', 'reunion', 'Cristina Alvargonzález', 'Reunión de lanzamiento del plan estratégico', 'La Agencia respalda el plan y propone constituir un comité con cinco miembros.', 'Plan estratégico');
    // Captación, eventos, bioincubadora
    K(4, '10:30', 'correo-enviado', 'Lucía Anes', 'Propuesta de asociación', 'Adjunto la propuesta con cuotas y servicios para Mirador Cardiotech.', 'Captación de socios');
    K(7, '13:00', 'reunion', 'Daniel Cabo', 'Primer contacto con Ladera Genómica', 'Café en Siero. Interés alto en el networking y en las ayudas. Quiere recibirnos en la planta.', 'Captación de socios');
    K(15, '09:00', 'correo-enviado', 'Eva Priañes', 'Invitación a conocer BioAsturias', 'Me gustaría visitaros y explicaros los servicios para empresas de cosmética natural.', 'Captación de socios');
    K(6, '16:40', 'reunion', 'Rodrigo Piñera', 'Visita al edificio de la Bioincubadora', 'Visitamos la planta baja: 600 m², posibilidad de laboratorios húmedos con obra.', 'Bioincubadora');
    K(17, '12:00', 'correo-recibido', 'Gonzalo Fano', 'Interés de Neurogaia', 'Estamos interesados en instalar un laboratorio de arranque cuando abra la Bioincubadora.', 'Bioincubadora');
    K(9, '10:20', 'correo-recibido', 'Sergio Pereda', 'Healthtech Madrid · propuesta de mesa', 'Propongo una mesa redonda sobre datos de salud con el hospital y dos empresas.', 'Healthtech Madrid');
    K(3, '11:15', 'correo-recibido', 'Alba Tolivia', 'Sala del hospital', 'El hospital cede una sala para 120 personas; hay que confirmar fecha.', 'Healthtech Madrid');
    K(12, '17:35', 'correo-enviado', 'Mercedes Naveda', 'Talento Bio · espacio de la feria', 'Te pido el plano del recinto y las medidas de los stands.', 'Talento Bio');
    K(22, '09:40', 'correo-recibido', 'Javier Cadavieco', 'Estudiantes voluntarios para la feria', 'Podemos aportar 10 estudiantes como azafatos y ayuda de organización.', 'Talento Bio');
    K(30, '12:00', 'correo-enviado', 'Natalia Quintana', 'Cuota anual 2026', 'Te envío la factura de la cuota anual y los servicios incluidos.', 'Facturación y cuotas');
    // Comunicaciones generadas: historial creíble para el resto de contactos
    const PLANT = {
      'correo-recibido': [['Re: Datos para el informe del sector', 'Os mando las cifras de facturación y empleo que me pedíais.'], ['Consulta sobre ayudas de innovación', 'Querríamos saber si BioAsturias puede orientarnos en las convocatorias abiertas.'], ['Confirmación de asistencia', 'Confirmamos nuestra asistencia a la jornada.']],
      'correo-enviado': [['Seguimiento de la propuesta', 'Retomo lo hablado en la reunión y te paso el resumen de próximos pasos.'], ['Resumen de la reunión', 'Adjunto el acta de lo que acordamos.'], ['Invitación a jornada del sector', 'Te invito a la próxima jornada de networking del sector.']],
      'reunion': [['Reunión de seguimiento', 'Repaso de novedades de la empresa y de los servicios de BioAsturias.'], ['Visita a instalaciones', 'Visita a las instalaciones y presentación del equipo.']],
      'llamada': [['Llamada de cortesía', 'Llamada breve para conocer sus necesidades este trimestre.']],
    };
    for (const c of contactos) {
      const n = c.principal ? 2 + Math.floor(rng() * 2) : Math.floor(rng() * 2.4);
      for (let j = 0; j < n; j++) {
        const tipo = azar(['correo-recibido', 'correo-enviado', 'correo-enviado', 'reunion', 'llamada']);
        const [asunto, resumen] = azar(PLANT[tipo]);
        const adh = entidades.find(e => e.id === c.entidadId).cats.includes('Adherido');
        const dias = adh ? 25 + Math.floor(rng() * 110) : 3 + Math.floor(rng() * (c.principal ? 100 : 75));
        comms.push({ id: 'm' + (++nc), fecha: conHora(addD(hoy, -dias), azar(['09:20', '11:45', '13:10', '16:25'])).toISOString(), tipo, asunto, resumen, proyecto: '',
          contactoId: c.id, entidadId: c.entidadId, fuente: tipo === 'reunion' ? 'calendario' : 'outlook' });
      }
    }

    // ---- plantillas de correo ----
    const plantillas = [
      { id: 'p-asamblea', nombre: 'Convocatoria de asamblea', asunto: 'Convocatoria de la Asamblea General de BioAsturias',
        cuerpo: 'Hola {nombre},\n\nTe escribo para convocar a {entidad} a la Asamblea General de BioAsturias, que se celebrará el próximo 16 de diciembre a las 17:00 en el salón de actos del Instituto Tecnológico Biocosta.\n\nOrden del día y documentación: https://bioasturias.example/asamblea\n\nSi no puedes asistir en tu cargo de {cargo}, puedes delegar tu voto respondiendo a este correo.\n\nUn abrazo,\nMateo' },
      { id: 'p-evento', nombre: 'Invitación a un evento', asunto: 'Te invito a Healthtech Madrid · reserva tu plaza',
        cuerpo: 'Hola {nombre},\n\nOrganizamos en Madrid una jornada sobre salud digital y tecnología sanitaria y nos encantaría contar con {entidad}.\n\nPrograma y reserva de plaza: https://bioasturias.example/healthtech\n\nComo {cargo}, creemos que puede interesarte la mesa sobre datos de salud. Dime si quieres que te guarde sitio.\n\nUn saludo,\nMateo' },
      { id: 'p-entrevista', nombre: 'Entrevista para una publicación', asunto: 'Una entrevista breve para nuestra publicación del sector',
        cuerpo: 'Hola {nombre},\n\nEstamos preparando una publicación sobre el sector biotecnológico de Asturias y nos gustaría entrevistarte a ti, como {cargo} de {entidad}. Serían 30 minutos, por videollamada o en persona.\n\nPuedes elegir un hueco aquí: https://bioasturias.example/entrevista\n\nGracias de antemano,\nMateo' },
      { id: 'p-encuesta', nombre: 'Encuesta a socios', asunto: 'Dos minutos para mejorar los servicios de BioAsturias',
        cuerpo: 'Hola {nombre},\n\nQueremos saber qué necesita {entidad} de BioAsturias el próximo año. La encuesta tiene 8 preguntas y se contesta en dos minutos:\n\nhttps://bioasturias.example/encuesta\n\nTus respuestas nos ayudarán a preparar el plan de actividades. ¡Gracias!\n\nMateo' },
    ];

    // ---- envíos pasados ----
    const envios = [];
    const E = (id, dias, asunto, plantilla, bloques, texto) => {
      const dest = contactos.filter(c => cumple(catsDe(c), bloques) && (id === 'env-1' ? c.principal : true));
      const fecha = conHora(addD(hoy, -dias), '10:05');
      const destinatarios = dest.map((c, i) => {
        const clics = rng() < 0.55 ? 1 + Math.floor(rng() * 3) : 0;
        const respondio = rng() < 0.33;
        const rebote = rng() < 0.03;
        return { contactoId: c.id, estado: rebote ? 'rebotado' : 'enviado', clics: rebote ? 0 : clics, respondio: rebote ? false : respondio,
          respuestaEn: respondio && !rebote ? new Date(fecha.getTime() + (3 + Math.floor(rng() * 70)) * 3600e3).toISOString() : null };
      });
      for (const d of destinatarios) { const c = contactos.find(x => x.id === d.contactoId); comms.push({ id: 'm' + (++nc), fecha: fecha.toISOString(), tipo: 'envio-masivo', asunto, resumen: 'Envío personalizado «' + asunto + '».', proyecto: '', contactoId: c.id, entidadId: c.entidadId, fuente: 'envios', envioId: id }); }
      envios.push({ id, fecha: fecha.toISOString(), asunto, plantillaId: plantilla, cuerpo: plantillas.find(p => p.id === plantilla).cuerpo, filtroTexto: texto, destinatarios, simulado: true });
    };
    E('env-1', 20, 'Convocatoria de la Asamblea General de BioAsturias', 'p-asamblea', [['Pleno derecho']], 'Pleno derecho · contactos principales');
    E('env-2', 13, 'Una entrevista breve para nuestra publicación del sector', 'p-entrevista', [['Entrevista plan estratégico']], 'Etiqueta: Entrevista plan estratégico');
    E('env-3', 8, 'Feria Talento Bio · inscripción de empresas', 'p-evento', [['Pleno derecho', 'Adherido'], ['Talento Bio']], '(Pleno derecho O Adherido) Y Talento Bio');
    E('env-4', 3, 'Te invito a Healthtech Madrid · reserva tu plaza', 'p-evento', [['Pleno derecho', 'Adherido'], ['Healthtech']], '(Pleno derecho O Adherido) Y Healthtech');

    // ---- dudas del cerebro ----
    const dudas = [
      { id: 'd1', pregunta: '¿Se envió ya la propuesta de asociación a Mirador Cardiotech?', contexto: 'Hay un correo tuyo a Lucía Anes con adjunto hace 6 días, pero también dos borradores sin enviar del mismo asunto.', itemId: 'i-env-mir', respuesta: '' },
      { id: 'd2', pregunta: '¿Ya ha pagado Quimera Agroalimentaria la cuota por transferencia?', contexto: 'Odoo la muestra pendiente, pero Samuel Arbesú te escribió ayer diciendo que «ya está hecho».', itemId: 'i-odoo-qui', respuesta: '' },
      { id: 'd3', pregunta: '¿La sala del hospital para Healthtech Madrid está ya confirmada?', contexto: 'Alba Tolivia pide que confirmes el aforo; tu último correo habla de «unas 100 personas».', itemId: 'i-fhv-sala', respuesta: '' },
      { id: 'd4', pregunta: '¿La factura de vuelos de la agencia es del proyecto Misión México?', contexto: 'Odoo la ha registrado sin proyecto; el importe coincide con el presupuesto de la misión.', itemId: 'i-odoo-viaje', respuesta: '' },
      { id: 'd5', pregunta: '¿Has contestado ya a Rodrigo Piñera sobre la visita técnica?', contexto: 'Lo marcaste como leído hace 6 días y no encuentro respuesta en Enviados.', itemId: 'i-ayv-local', respuesta: '' },
    ];

    // ---- contactos detectados en el correo ----
    const detectados = [
      { id: 'x1', nombre: 'Verónica', apellidos: 'Ladines Soto', cargo: 'Directora de desarrollo de negocio', email: `veronica.ladines@${entPorClave.lad.dominio}`, entidadSugerida: 'e-lad', entidadNueva: '', cats: ['Posible socio', 'I+D'], origen: 'Copia en el correo «Visita a Ladera Genómica: fechas»' },
      { id: 'x2', nombre: 'Ximena', apellidos: 'Cortés Ibarra', cargo: 'Coordinadora del clúster biotecnológico', email: 'ximena.cortes@redbiotec-altiplano.example', entidadSugerida: '', entidadNueva: 'Red Biotec Altiplano (México)', cats: ['No socio', 'Misión México'], origen: 'Firma del correo «Contactos en Ciudad de México»' },
      { id: 'x3', nombre: 'Ana Belén', apellidos: 'Cuetos Marqués', cargo: 'Técnica de gestión de ayudas', email: `anabelen.cuetos@${entPorClave.ari.dominio}`, entidadSugerida: 'e-ari', entidadNueva: '', cats: ['No socio', 'Mentoring'], origen: 'Copia en el correo «Justificación del mentoring»' },
      { id: 'x4', nombre: 'Ramiro', apellidos: 'Cienfuegos Alba', cargo: 'Responsable de compras', email: `ramiro.cienfuegos@${entPorClave.cve.dominio}`, entidadSugerida: 'e-cve', entidadNueva: '', cats: ['Adherido', 'Medio ambiente'], origen: 'Firma del correo «Pasar de adherido a pleno derecho»' },
      { id: 'x5', nombre: 'Gema', apellidos: 'Fidalgo Orejas', cargo: 'Directora de comunicación', email: 'gema.fidalgo@estudiofaro.example', entidadSugerida: '', entidadNueva: 'Estudio Faro Creativo', cats: ['No socio', 'Rediseño web'], origen: 'Firma del correo «Presupuesto del rediseño web»' },
    ];

    // ---- fuentes ----
    const fuentes = [
      { id: 'outlook', nombre: 'Outlook', familia: 'Microsoft', cuenta: 'mateo@bioasturias.example', estado: 'conectada', ultima: 'hoy 06:00', elementos: 3482, lee: ['Bandeja de entrada y enviados', 'Correos marcados como leídos sin respuesta', 'Contactos que aparecen en copias y firmas', 'Archivos adjuntos (nombre y extracto)'] },
      { id: 'onedrive', nombre: 'OneDrive', familia: 'Microsoft', cuenta: 'mateo@bioasturias.example', estado: 'conectada', ultima: 'hoy 06:00', elementos: 1215, lee: ['Carpetas de proyectos (Plan estratégico, Bioincubadora, Mentoring)', 'Documentos modificados desde la última sincronización', 'Comentarios y menciones en documentos'] },
      { id: 'gdrive', nombre: 'Google Drive', familia: 'Google', cuenta: 'mateo.bioasturias@gmail.example', estado: 'conectada', ultima: 'hoy 06:00', elementos: 640, lee: ['Carpetas compartidas con empresas y socios', 'Hojas de cálculo de seguimiento', 'Documentos compartidos contigo'] },
      { id: 'gmail', nombre: 'Gmail', familia: 'Google', cuenta: '', estado: 'disponible', ultima: '—', elementos: 0, lee: ['Bandeja de entrada y enviados de la cuenta de Google', 'Etiquetas y conversaciones sin respuesta'] },
      { id: 'odoo', nombre: 'Odoo', familia: 'Facturación', cuenta: 'bioasturias.odoo.example', estado: 'conectada', ultima: 'hoy 06:00', elementos: 428, lee: ['Contactos: empresas y personas, que se importan al CRM', 'Facturas emitidas y su estado de cobro', 'Facturas de proveedores por aprobar o pagar', 'Pagos recibidos', 'Solo lectura: Odoo sigue siendo el sistema de facturación y contabilidad'] },
      { id: 'calendario', nombre: 'Calendario', familia: 'Microsoft', cuenta: 'mateo@bioasturias.example', estado: 'conectada', ultima: 'hoy 06:00', elementos: 92, lee: ['Reuniones de hoy y de la semana', 'Invitaciones nuevas, cambios y cancelaciones', 'Asistentes y enlaces de videollamada'] },
    ];

    // ---- cerebro: memoria (base de datos) que leen y escriben Claude, la lectura diaria y el panel ----
    // tipo: nota (un dato) | pendiente (algo por hacer o por cumplir, con fecha opcional)
    // fuente: claude | lectura (lectura automática de las 06:00) | panel
    const CAT_M = {"mem01": "correo", "mem02": "reunion", "mem03": "documento", "mem04": "correo", "mem05": "correo", "mem06": "reunion", "mem07": "factura", "mem08": "documento", "mem09": "reunion", "mem10": "correo", "mem11": "reunion", "mem12": "documento", "mem13": "reunion", "mem14": "llamada"};
    const M = (id, tipo, fuente, dias, h, texto, sobre, o = {}) => ({ id, tipo, cat: CAT_M[id] || 'otro', fuente, fecha: atras(dias, h), texto, sobre, vence: o.v !== undefined ? dl(o.v) : null, estado: o.estado || 'abierta', autor: fuente === 'claude' ? 'Claude (Mateo)' : fuente === 'lectura' ? 'Lectura diaria' : 'Mateo' });
    const memoria = [
      M('mem01', 'pendiente', 'claude', 0, '08:12', 'Mandar a Lucía Anes la tabla de cuotas de pleno derecho después de la visita a Mirador Cardiotech.', { tipo: 'entidad', id: 'e-mir' }, { v: 2 }),
      M('mem02', 'nota', 'claude', 0, '08:10', 'Mirador Cardiotech duda entre pleno derecho y adherido; lo que más le interesa es la misión a México.', { tipo: 'entidad', id: 'e-mir' }),
      M('mem03', 'pendiente', 'lectura', 0, '06:00', 'El informe de viabilidad de la Bioincubadora se entrega hoy: faltan las conclusiones y el anexo económico.', { tipo: 'proyecto', id: 'Bioincubadora' }, { v: 0 }),
      M('mem04', 'pendiente', 'claude', 1, '17:40', 'Confirmar a Rodrigo Piñera fechas para la visita técnica al local con el arquitecto.', { tipo: 'proyecto', id: 'Bioincubadora' }, { v: 3 }),
      M('mem05', 'nota', 'claude', 2, '12:30', 'Ribera Biomateriales viaja a México con dos personas si se confirman las fechas antes de fin de mes.', { tipo: 'entidad', id: 'e-rib' }),
      M('mem06', 'pendiente', 'claude', 2, '12:32', 'Cerrar con las empresas la agenda definitiva de la misión a México.', { tipo: 'proyecto', id: 'Misión México' }, { v: 5 }),
      M('mem07', 'nota', 'lectura', 1, '06:00', 'Quimera Agroalimentaria tiene la cuota del segundo semestre sin pagar (Odoo).', { tipo: 'entidad', id: 'e-qui' }),
      M('mem08', 'pendiente', 'claude', 3, '10:05', 'Asamblea General: enviar convocatoria y orden del día con 10 días de antelación.', { tipo: 'proyecto', id: 'Asamblea' }, { v: 6 }),
      M('mem09', 'nota', 'claude', 4, '16:20', 'Para el plan estratégico quedan dos entrevistas: Tomás Roces y Alejandro Montes.', { tipo: 'proyecto', id: 'Plan estratégico' }),
      M('mem10', 'pendiente', 'claude', 5, '09:45', 'Pedir al Estudio Faro el presupuesto por fases del rediseño (marca, web y guía).', { tipo: 'proyecto', id: 'Rediseño web y marca' }, { v: 8 }),
      M('mem11', 'nota', 'panel', 6, '18:05', 'Healthtech Madrid: la Fundación Hospitalaria puede presentar dos pilotos de salud digital.', { tipo: 'proyecto', id: 'Healthtech Madrid' }),
      M('mem12', 'pendiente', 'claude', 7, '11:00', 'Justificación del mentoring: plazo de la Agencia para la documentación final.', { tipo: 'proyecto', id: 'Mentoring científicos' }, { v: 10 }),
      M('mem13', 'pendiente', 'claude', 9, '13:15', 'Reservar sala para la feria Talento Bio.', { tipo: 'proyecto', id: 'Talento Bio' }, { estado: 'cerrada' }),
      M('mem14', 'nota', 'claude', 12, '10:30', 'Cuenca Verde prefiere la cuota de adherido el primer año.', { tipo: 'entidad', id: 'e-cve' }, { estado: 'sustituida' }),
    ];
    // Fichas «estado actual»: un texto corto por proyecto que Claude reescribe entero (la versión anterior se guarda)
    const F = (proyecto, dias, h, texto, versiones) => ({ id: 'f-' + slug(proyecto), proyecto, fecha: atras(dias, h), texto, versiones, autor: 'Claude (Mateo)' });
    const fichas = [
      F('Bioincubadora', 0, '08:20', 'Informe de viabilidad v3 con entrega hoy al comité; faltan conclusiones y anexo económico. El Ayuntamiento ofrece la planta baja del edificio; pendiente fijar la visita técnica con el arquitecto. Comité hoy a las 16:30.', 4),
      F('Misión México', 2, '12:40', 'Agenda provisional enviada a las empresas. Ribera confirma dos personas si se cierran fechas este mes. Falta asignar la factura de vuelos al proyecto en Odoo.', 3),
      F('Plan estratégico', 4, '16:25', 'Capítulo de retos en revisión. Quedan dos entrevistas (Tomás Roces y Alejandro Montes). Elena Ablanedo propone dos huecos para la suya.', 6),
      F('Captación de socios', 0, '08:15', 'Mirador Cardiotech: visita hoy, duda entre pleno derecho y adherido. Ladera Genómica propone visita la semana que viene. Cuenca Verde espera la comparativa de cuotas.', 2),
    ];
    // Registro de accesos al conector: quién usó qué herramienta y cuándo
    const R = (dias, h, quien, herramienta, detalle) => ({ fecha: atras(dias, h), quien, herramienta, detalle });
    const registro = [
      R(0, '08:20', 'Claude (Mateo)', 'reescribir_estado', 'Bioincubadora'),
      R(0, '08:15', 'Claude (Mateo)', 'reescribir_estado', 'Captación de socios'),
      R(0, '08:12', 'Claude (Mateo)', 'apuntar', 'Pendiente sobre Mirador Cardiotech'),
      R(0, '08:10', 'Claude (Mateo)', 'contexto_entidad', 'Mirador Cardiotech'),
      R(0, '08:02', 'Claude (Mateo)', 'brief_de_hoy', ''),
      R(0, '06:00', 'Lectura diaria', 'leer_fuentes', 'Outlook, OneDrive, Google Drive, Odoo y calendario'),
      R(1, '17:40', 'Claude (Mateo)', 'apuntar', 'Pendiente sobre la Bioincubadora'),
      R(1, '17:35', 'Claude (Mateo)', 'buscar', '«local Bioincubadora»'),
    ];
    const conector = { url: 'https://panel.bioasturias.example/mcp', asistentes: [
      { nombre: 'Claude', quien: 'Mateo', estado: 'conectado', ultimo: atras(0, '08:20') },
      { nombre: 'ChatGPT', quien: '', estado: 'sin conectar', ultimo: null },
    ] };

    return { entidades, contactos, items, agenda, tareas, comms, plantillas, envios, dudas, detectados, fuentes, memoria, fichas, registro, conector, categorias: CATEGORIAS, areas: AREAS, proyectos: PROYECTOS, subproyectos: SUBPROYECTOS,
      ventana: { ini: ini.toISOString(), fin: fin.toISOString() } };
  }
  return { base };
})();
