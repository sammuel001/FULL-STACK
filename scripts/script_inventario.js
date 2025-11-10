const admin = require('firebase-admin'); 
const fs = require('fs');
const csv = require('csv-parser');
const path = require('path'); // <-- ¡Añadido!

// === RUTAS ACTUALIZADAS Y SEGURAS ===
try {
  const serviceAccount = require('../llave.json');
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
} catch (e) {}

const db = admin.firestore();
// Utilizamos path.join para construir una ruta absoluta a prueba de fallos
const RUTA_CSV_INVENTARIO = path.join(__dirname, '..', 'excel', 'inventario.csv'); 
// ===============================================

async function cargarInventarioCSV() {
  console.log(`\n*** INICIANDO CARGA DE INVENTARIO (Subcolección) ***`);
  // console.log(`Ruta de búsqueda: ${RUTA_CSV_INVENTARIO}`); // Línea de prueba opcional
  
  // Código para asegurar que el archivo existe ANTES de fallar
  if (!fs.existsSync(RUTA_CSV_INVENTARIO)) {
      console.error(`\n🛑 ERROR CRÍTICO: El archivo no existe en la ruta esperada:`);
      console.error(`=> ${RUTA_CSV_INVENTARIO}`);
      console.error("Asegúrate de que el archivo inventario.csv esté dentro de la carpeta 'excel'.");
      return; 
  }

  const productosRef = db.collection('productos'); 
  const batch = db.batch();
  let contador = 0;

  await new Promise((resolve, reject) => {
    fs.createReadStream(RUTA_CSV_INVENTARIO)
      .pipe(csv({ trim: true })) 
      .on('data', (row) => {
        
        const pId = row.productoId;
        const bId = row.bodega;
        
        if (!pId || !bId) {
          console.warn("Saltando fila sin productoId o bodega:", row);
          return;
        }

        contador++;

        const stockDocument = {
          bodega: bId,
          stock: parseInt(row.stock, 10) || 0,
          sku: row.sku,
          descripcion: row.descripcion,
          precio: parseFloat(row.precio) || 0
        };

        // Definir la ruta de la subcolección: /productos/{pId}/inventario/{bId}
        const docRef = productosRef.doc(pId).collection('inventario').doc(`${bId}_stock`); 
        
        batch.set(docRef, stockDocument);
      })
      .on('end', async () => {
        if (contador > 0) {
            console.log(`Se procesaron ${contador} filas. Enviando batch...`);
            await batch.commit();
            console.log(`✅ ¡Carga de Inventario completada! Se crearon/actualizaron ${contador} documentos de stock.`);
        } else {
            console.error("¡Error! No se leyó ningún inventario. Revisa el contenido de tu CSV.");
        }
        resolve();
      })
      .on('error', reject);
  });
}

cargarInventarioCSV();