import express from "express";
import multer from "multer";
import { exec } from "child_process";
import fs from "fs";
import path from "path";
import { createServer as createViteServer } from "vite";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const upload = multer({ dest: "uploads/" });

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Ensure uploads directory exists
  if (!fs.existsSync("uploads")) {
    fs.mkdirSync("uploads");
  }

  // API route to convert EPS to PNG
  app.post("/api/convert-eps", upload.single("file"), (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const inputPath = req.file.path;
    const outputPath = `${inputPath}.png`;

    // Options to prevent exec from crashing if Ghostscript/ImageMagick outputs too many warnings
    const execOptions = { maxBuffer: 10 * 1024 * 1024 }; // 10MB buffer

    // Try Ghostscript first, then ImageMagick
    // OPTIMIZATION FOR SPEED: 
    // -r72 (72dpi) is used to process the image much faster (4x faster than 144dpi).
    // -dTextAlphaBits=2 -dGraphicsAlphaBits=2 provides basic anti-aliasing but is faster than 4.
    const gsCmd = `gs -dSAFER -dBATCH -dNOPAUSE -dEPSCrop -sDEVICE=pngalpha -r72 -dTextAlphaBits=2 -dGraphicsAlphaBits=2 -sOutputFile="${outputPath}" "${inputPath}"`;
    const gsWinCmd = `gswin64c -dSAFER -dBATCH -dNOPAUSE -dEPSCrop -sDEVICE=pngalpha -r72 -dTextAlphaBits=2 -dGraphicsAlphaBits=2 -sOutputFile="${outputPath}" "${inputPath}"`;
    
    // ImageMagick fallbacks optimized for speed:
    // -density 72 parses the vector much faster than 300.
    // -thumbnail 512x512 is faster than -resize and strips unnecessary profiles.
    const convertCmd = `convert -density 72 -colorspace sRGB "${inputPath}" -thumbnail 512x512\\> -background white -flatten "${outputPath}"`;
    const magickCmd = `magick -density 72 -colorspace sRGB "${inputPath}" -thumbnail 512x512\\> -background white -flatten "${outputPath}"`;

    exec(gsCmd, execOptions, (gsError, gsStdout, gsStderr) => {
      if (gsError) {
        // Ghostscript (gs) failed, silently try Windows Ghostscript (gswin64c)
        exec(gsWinCmd, execOptions, (gsWinError, gsWinStdout, gsWinStderr) => {
          if (gsWinError) {
            // Windows Ghostscript failed, silently try ImageMagick (convert)
            exec(convertCmd, execOptions, (error, stdout, stderr) => {
              if (error) {
                // ImageMagick (convert) failed, silently try ImageMagick v7 (magick)
                exec(magickCmd, execOptions, (magickError, magickStdout, magickStderr) => {
                  if (magickError) {
                    console.error("EPS Conversion failed. Ensure Ghostscript or ImageMagick is installed and in your PATH.");
                    try { fs.unlinkSync(inputPath); } catch (e) {}
                    return res.status(500).json({ 
                      error: "Failed to convert EPS file. Ensure ImageMagick or Ghostscript is installed.",
                      details: magickStderr
                    });
                  }
                  sendConvertedFile();
                });
              } else {
                sendConvertedFile();
              }
            });
          } else {
            sendConvertedFile();
          }
        });
      } else {
        sendConvertedFile();
      }
    });

    function sendConvertedFile() {
      fs.readFile(outputPath, (err, data) => {
        // Clean up files
        try {
          if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
          if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        } catch (e) {
          console.error("Cleanup error:", e);
        }

        if (err) {
          return res.status(500).json({ error: "Failed to read converted file" });
        }

        const base64Image = data.toString("base64");
        res.json({ 
          success: true, 
          image: `data:image/png;base64,${base64Image}`,
          base64: base64Image
        });
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
