const { Firestore } = require("@google-cloud/firestore");

async function storeData(id, data) {
  const db = new Firestore();
  const predictCollection = db.collection("prediction");
  return predictCollection.doc(String(id)).set(data);
}

module.exports = storeData;
