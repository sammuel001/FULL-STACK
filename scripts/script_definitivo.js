const admin = require('firebase-admin'); 
const fs = require('fs');
const csv = require('csv-parser');

// === RUTAS ACTUALIZADAS PARA CARPETA SCRIPTS/ ===
const serviceAccount = require('../llave.json'); 
const RUTA_CSV = '../excel/ordenes.csv'; 
// ===============================================

try {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
} catch (e) { /* Ignora si ya está inicializado */ }

const db = admin.firestore();

// [Función auxiliar para manejo de fechas]
function convertirAFechaSegura(textoFecha) {
  if (!textoFecha || textoFecha.trim() === '') { return null; }
  const fecha = new Date(textoFecha);
  if (isNaN(fecha.getTime())) { return null; } 
  return admin.firestore.Timestamp.fromDate(fecha);
}

async function ejecutarCarga() {
  console.log("\n*** EJECUTANDO SCRIPT DEFINITIVO (V6 - Mapeo Corregido) ***\n");
  try {
    // 1. Borrado de colección
    console.log("Borrando la colección 'ordenes' antigua...");
    await db.collection('ordenes').get().then(snapshot => {
      if (snapshot.empty) return Promise.resolve();
      const batch = db.batch();
      snapshot.docs.forEach(doc => { batch.delete(doc.ref); });
      return batch.commit();
    });
    console.log("Colección 'ordenes' borrada.");

    // 2. Carga de datos
    const ordenesRef = db.collection('ordenes');
    const promesasDeCarga = [];
    let contador = 0;

    await new Promise((resolve, reject) => {
      fs.createReadStream(RUTA_CSV)
        .pipe(csv({ trim: true }))
        .on('data', (fila) => {
          try {
            const docId = fila.ordenId;
            if (!docId) { return; }
            
            // --- Mapeo Corregido (V6) ---
            const fechaOrden = new Date(fila.fecha);
            const entregadoBool = (fila.envio_fechaEntrega === 'true' || fila.envio_fechaEntrega === 'TRUE');

            const nuevaOrden = {
              usuarioId: fila.usuarioId ? fila.usuarioId.trim() : null,
              fechaOrden: !isNaN(fechaOrden.getTime()) ? admin.firestore.Timestamp.fromDate(fechaOrden) : null,
              envio: {
                direccion: fila.envio_direccion ? fila.envio_direccion.trim() : null,
                transportadora: fila.envio_estado ? fila.envio_estado.trim() : null, // Corregido
                estado: fila.envio_entregado ? fila.envio_entregado.trim() : null, // Corregido
                entregado: entregadoBool, // Corregido
                fechaEntrega: null 
              },
              pago: {
                referencia: !isNaN(new Date(fila.pago_referencia).getTime()) ? admin.firestore.Timestamp.fromDate(new Date(fila.pago_referencia)) : null,
                txn: fila.pago_txn ? fila.pago_txn.trim() : null,
                usuarioId: fila.usuarioId ? fila.usuarioId.trim() : null
              }
            };
            // ------------------------------

            promesasDeCarga.push(ordenesRef.doc(docId.toString()).set(nuevaOrden));
            contador++;
          } catch (error) { console.error(`Error procesando ${fila.ordenId}:`, error); }
        })
        .on('end', async () => { await Promise.all(promesasDeCarga); resolve(); })
        .on('error', reject);
    });

    console.log(`\n¡Éxito! Proceso de carga terminado. Se cargaron ${contador} ordenes.`);
    console.log('--- PROCESO DE CARGA DE ORDENES COMPLETADO ---');
  } catch (error) { console.error('--- FALLÓ LA EJECUCIÓN DE LA CARGA ---:', error); }
}

ejecutarCarga();