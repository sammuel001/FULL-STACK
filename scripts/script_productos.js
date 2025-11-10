const { Firestore } = require('@google-cloud/firestore');
const fs = require('fs');
const csv = require('csv-parser');

const db = new Firestore({ keyFilename: '../llave.json' }); // Ruta actualizada
const coleccionRef = db.collection('productos');
const RUTA_CSV_PRODUCTOS = '../excel/productos.csv'; // Ruta actualizada

async function cargarProductosCSV() {
  console.log(`Iniciando la carga desde "${RUTA_CSV_PRODUCTOS}"...`);
  const batch = db.batch();
  let contador = 0;

  await new Promise((resolve, reject) => {
    fs.createReadStream(RUTA_CSV_PRODUCTOS)
      .pipe(csv({ trim: true })) 
      .on('data', (row) => {
        if (!row.productoId) { return; }
        contador++;
        
        const documentoParaFirestore = {
          nombre: row.nombre,
          descripcion: row.descripcion,
          marca: row.marca,
          categoria: row.categoria,
          precio: parseFloat(row.precio) || 0,
          stock: parseInt(row.stock, 10) || 0
        };

        const docRef = coleccionRef.doc(row.productoId); 
        batch.set(docRef, documentoParaFirestore);
      })
      .on('end', async () => {
        if (contador > 0) {
            await batch.commit();
            console.log(`✅ ¡Carga masiva completada! Se escribieron ${contador} documentos.`);
        } else {
            console.error("¡Error! No se leyó ningún producto.");
        }
        resolve();
      })
      .on('error', reject);
  });
}
cargarProductosCSV();