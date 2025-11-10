const admin = require('firebase-admin'); 
const fs = require('fs');
const csv = require('csv-parser');

// === RUTAS ACTUALIZADAS PARA CARPETA SCRIPTS/ ===
try {
  const serviceAccount = require('../llave.json');
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
} catch (e) {}

const db = admin.firestore();
const coleccionRef = db.collection('usuarios');
const RUTA_CSV_USUARIOS = '../excel/usuarios.csv'; 
// ===============================================

function convertirAFechaSegura(textoFecha) {
  if (!textoFecha || textoFecha.trim() === '') { return null; }
  const fecha = new Date(textoFecha);
  if (isNaN(fecha.getTime())) { return null; } 
  return admin.firestore.Timestamp.fromDate(fecha);
}

async function cargarUsuariosCSV() {
  console.log(`Iniciando la carga desde "${RUTA_CSV_USUARIOS}"...`);
  const batch = db.batch();
  let contador = 0;

  await new Promise((resolve, reject) => {
    fs.createReadStream(RUTA_CSV_USUARIOS)
      .pipe(csv({ trim: true }))
      .on('data', (row) => {
        const docId = row.usuarioId; 
        if (!docId) { return; }
        contador++;

        const documentoParaFirestore = {
          nombre: row.nombre,
          apellido: row.apellido,
          email: row.email,
          telefono: row.telefono,
          direccion: row.direccion,
          fechaRegistro: convertirAFechaSegura(row.fechaRegistro)
        };

        const docRef = coleccionRef.doc(docId); 
        batch.set(docRef, documentoParaFirestore);
      })
      .on('end', async () => {
        if (contador > 0) {
            await batch.commit();
            console.log(`✅ ¡Carga masiva completada! Se escribieron ${contador} usuarios.`);
        } else {
            console.error("¡Error! No se leyó ningún usuario.");
        }
        resolve();
      })
      .on('error', reject);
  });
}
cargarUsuariosCSV();