const admin = require('firebase-admin'); 
const fs = require('fs');
const csv = require('csv-parser');

// === RUTAS ACTUALIZADAS PARA CARPETA SCRIPTS/ ===
try {
  const serviceAccount = require('../llave.json');
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
} catch (e) {}

const db = admin.firestore();
const coleccionRef = db.collection('reseñas');
const RUTA_CSV_RESEÑAS = '../excel/reseñas.csv'; 
// ===============================================

function convertirAFechaSegura(textoFecha) {
  if (!textoFecha || textoFecha.trim() === '') { return null; }
  const fecha = new Date(textoFecha);
  if (isNaN(fecha.getTime())) { return null; } 
  return admin.firestore.Timestamp.fromDate(fecha);
}

async function cargarReseñasCSV() {
  console.log(`Iniciando la carga desde "${RUTA_CSV_RESEÑAS}"...`);
  const batch = db.batch();
  let contador = 0;

  await new Promise((resolve, reject) => {
    fs.createReadStream(RUTA_CSV_RESEÑAS)
      .pipe(csv({ trim: true }))
      .on('data', (row) => {
        const docId = row.reseñaId; 
        if (!docId) { return; }
        contador++;

        const documentoParaFirestore = {
          productoId: row.productoId,
          usuarioId: row.usuarioId,
          comentario: row.comentario,
          calificacion: parseInt(row.calificacion, 10) || 0,
          fecha: convertirAFechaSegura(row.fecha)
        };

        const docRef = coleccionRef.doc(docId); 
        batch.set(docRef, documentoParaFirestore);
      })
      .on('end', async () => {
        if (contador > 0) {
            await batch.commit();
            console.log(`✅ ¡Carga masiva completada! Se escribieron ${contador} reseñas.`);
        } else {
            console.error("¡Error! No se leyó ninguna reseña.");
        }
        resolve();
      })
      .on('error', reject);
  });
}
cargarReseñasCSV();