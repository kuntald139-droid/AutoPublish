import { GoogleGenAI } from '@google/genai';
import { v2 as cloudinary } from 'cloudinary';
import { Jimp ,loadFont} from 'jimp'; // <--- New image processing library
import { SANS_64_WHITE } from 'jimp/fonts';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

// Initialize clients
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }); 

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const INSTAGRAM_BUSINESS_ACCOUNT_ID = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
const FACEBOOK_ACCESS_TOKEN = process.env.FACEBOOK_ACCESS_TOKEN;

// Permanent link to a robust, minimalist background (dark gradient fits white text well)
const BACKGROUND_IMAGE_URL = "https://images.unsplash.com/photo-1550684376-efcbd6e3f031?q=80&w=1024&h=1024&auto=format&fit=crop";

async function generateAndPostToInstagram() {
  try {
    // --- STEP 1: Generate the Quote via Gemini ---
    console.log('🤖 Generating quote via Gemini...');
    let caption = '';
    
    try {
      const quoteResponse = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: 'Generate a short, powerful motivational quote (under 20 words) for Instagram.',
        config: {
          systemInstruction: 'You are an inspiring content creator. Output only the quote, no extra remarks or conversational filler.',
        }
      });
      caption = quoteResponse.text.trim().replace(/^"|"$/g, ''); // Removes wrapping quotes if any
    } catch (fallbackError) {
      // Basic resilience wrapper
      console.warn('⚠️ Gemini error, attempting ultra-stable fallback...');
      const backupResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: 'Generate a short motivational quote.',
        config: { systemInstruction: 'Output only the quote.' }
      });
      caption = backupResponse.text.trim().replace(/^"|"$/g, '');
    }
    
    console.log(`✨ Generated Caption: "${caption}"`);

    // --- STEP 2: Burn the Text onto the Image (Jimp) ---
   console.log('🎨 Processing image: Writing quote onto background...');
    
    // Load the template background image
    const image = await Jimp.read(BACKGROUND_IMAGE_URL);
    
    // Load the font directly using the v1.x native function
    const font = await loadFont(SANS_64_WHITE);
    
    // Define exact parameters matching Jimp's strict Zod layout schema
    const padding = 100;
    const maxWidth = image.bitmap.width - (padding * 2); // Centers the box dynamically

    // v1.x uses a single structured object argument for full text formatting properties
    image.print({
      font: font,
      x: padding,                  // Start printing 100px from the left
      y: 350,                      // Height position from the top
      text: {
        text: caption,             // The string message
        alignmentX: 2,             // 2 represents horizontal center alignment in Jimp v1 (CENTER)
        alignmentY: 16,            // 16 represents vertical middle alignment in Jimp v1 (MIDDLE)
      },
      maxWidth: maxWidth,          // Confines wrapping width boundaries
      maxHeight: 400               // Bounds vertical growth boundaries
    });

    // Convert the modified Jimp object into a raw buffer in memory (PNG format)
    // console.log('🔄 Converting processed image to buffer...');
    // const buffer = await image.getBufferAsync(Jimp.MIME_PNG);
    // Convert the modified Jimp object into a raw buffer in memory (PNG format)
console.log('🔄 Converting processed image to buffer...');
const buffer = await image.getBuffer('image/png'); // Simple, clean string MIME type

// --- STEP 3: Upload the PROCESSED Image to Cloudinary ---
    console.log('☁️ Uploading modified image to Cloudinary...');
    
    // Clean, single-stream execution wrapper
    const permanentImageUrl = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { 
          folder: 'instagram_automation', 
          resource_type: 'image',
          format: 'jpg' // Forces Cloudinary to deliver a strict JPEG, which Meta prefers
        },
        (error, result) => { 
          if (error) return reject(error); 
          resolve(result.secure_url); 
        }
      );
      uploadStream.end(buffer);
    });

    console.log('🔗 Processed Image URL created:', permanentImageUrl);

   // --- STEP 4: Publish to Instagram Business ---
    console.log('📸 Creating Instagram media container...');
    const containerUrl = `https://graph.facebook.com/v20.0/${INSTAGRAM_BUSINESS_ACCOUNT_ID}/media`;
    
    const finalCaption = `${caption}\n\n#motivation #dailyquote #mindset #automation`;

    const containerResponse = await axios.post(containerUrl, {
      image_url: permanentImageUrl, 
      caption: finalCaption, 
      access_token: FACEBOOK_ACCESS_TOKEN
    });
    
    const creationId = containerResponse.data.id;
    console.log(`📦 Container created (ID: ${creationId}).`);
    
    // --- NEW: Add a 30-second delay loop to let Meta finish processing the image ---
    console.log('⏳ Waiting 30 seconds for Meta to process and download the image...');
    await new Promise(resolve => setTimeout(resolve, 30000)); 

    console.log('🚀 Publishing media now...');
    await axios.post(`https://graph.facebook.com/v20.0/${INSTAGRAM_BUSINESS_ACCOUNT_ID}/media_publish`, {
      creation_id: creationId,
      access_token: FACEBOOK_ACCESS_TOKEN
    });

    console.log('🎉 Successfully published text-on-image post to Instagram!');

  }  catch (error) {
    console.error('❌ An error occurred in the pipeline:');
    if (error.response && error.response.data) {
      // This prints the exact error title, subcode, and message coming straight from Meta
      console.error('📊 Meta Graph API Error Details:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error(error.message);
    }
  }
}

generateAndPostToInstagram();
