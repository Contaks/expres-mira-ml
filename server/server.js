require("dotenv").config();
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const tf = require("@tensorflow/tfjs-node");
const fs = require("fs");
const path = require("path");
const { Firestore } = require("@google-cloud/firestore");
const { Storage } = require("@google-cloud/storage");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 9000;

// Set up CORS
app.use(cors({ origin: "*" }));

// Initialize Firestore
const firestore = new Firestore({
  projectId: process.env.GCLOUD_PROJECT,
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
});

// Initialize Cloud Storage
const storage = new Storage({
  projectId: process.env.GCLOUD_PROJECT,
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
});
const bucket = storage.bucket(process.env.GCLOUD_STORAGE_BUCKET);

let model;

// Load the TensorFlow model
async function loadModel() {
  try {
    model = await tf.loadLayersModel(process.env.MODEL_URL);
    console.log("Model loaded successfully");
  } catch (error) {
    console.error("Error loading the model", error);
    throw error;
  }
}

// Middleware to ensure model is loaded before processing requests
const ensureModelLoaded = async (req, res, next) => {
  if (!model) {
    try {
      await loadModel();
      next(); // Proceed if model is successfully loaded
    } catch (error) {
      console.error("Error loading the model", error);
      return res.status(500).json({
        status: "fail",
        message: "Model not loaded. Please try again later.",
        data: {},
      });
    }
  } else {
    next(); // Proceed if model is already loaded
  }
};

// Multer setup for file upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // max 5MB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("File must be an image."));
    }
  },
});

// Function to store data in Firestore
async function storeData(id, data) {
  const predictCollection = firestore.collection("predictions");
  await predictCollection.doc(String(id)).set(data);
}

// Function to upload file to Cloud Storage
async function uploadFileToStorage(file, destination) {
  const filePath = path.join(__dirname, `temp/${file.originalname}`);
  try {
    fs.writeFileSync(filePath, file.buffer);
    await bucket.upload(filePath, {
      destination: destination,
    });
    fs.unlinkSync(filePath); // Remove temp file after upload
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${destination}`;
    return publicUrl;
  } catch (error) {
    console.error("Error uploading file to Cloud Storage:", error);
    throw error;
  }
}

// Function to make prediction using TensorFlow model
async function predictUsingModel(imageUrl) {
  const imageBuffer = await axios.get(imageUrl, {
    responseType: "arraybuffer",
  });
  const imageData = tf.node.decodeImage(imageBuffer.data);
  const processedImage = tf.image
    .resizeBilinear(imageData, [224, 224])
    .toFloat()
    .div(tf.scalar(255));
  const prediction = await model.predict(processedImage.expandDims());
  const score = prediction.flatten().arraySync()[0];
  return { score };
}

// POST endpoint for image upload and prediction
app.post(
  "/predict/:id",
  ensureModelLoaded,
  upload.single("image"),
  async (req, res) => {
    try {
      // Ensure file is present
      if (!req.file) {
        return res
          .status(400)
          .json({ status: "fail", message: "No file uploaded." });
      }

      // Upload file to Cloud Storage
      const imageUrl = await uploadFileToStorage(
        req.file,
        `images/${req.file.originalname}`
      );

      // Perform prediction using TensorFlow model
      const prediction = await predictUsingModel(imageUrl);

      // Create response object
      const createdAt = new Date().toISOString();
      const response = {
        id: req.params.id,
        imageUrl,
        result: prediction.score >= 0.9 ? "Positive" : "Negative",
        explanation:
          "Brain tumor is a condition where there is abnormal tissue growth inside the brain.",
        suggestion:
          prediction.score >= 0.9
            ? "Consult with the nearest doctor immediately to determine the level of disease risk."
            : "You are healthy!",
        confidenceScore: prediction.score,
        createdAt,
      };

      // Store prediction data in Firestore
      await storeData(req.params.id, response);

      // Send success response to client
      res.status(200).json({
        status: "success",
        message: "Prediction successful",
        data: response,
      });
    } catch (error) {
      console.error("Prediction error:", error);
      res.status(500).json({
        status: "fail",
        message: "Prediction failed",
        error: error.message,
      });
    }
  }
);  


app.get("/", (req, res) => {
  res.send("Welcome to the Brain Tumor Detection API");
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  loadModel(); // Load the model when server starts
});
