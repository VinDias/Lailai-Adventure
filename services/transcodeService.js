const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

/**
 * Transcodifica um vídeo original para o formato HLS com múltiplas resoluções.
 * @param {string} videoPath - Caminho absoluto para o arquivo de vídeo original (.mp4)
 * @param {string} outputFolder - Caminho da pasta onde o HLS será gerado
 * @returns {Promise<boolean>} - Retorna true se a transcodificação foi bem-sucedida
 */
async function transcodeToHLS(videoPath, outputFolder) {
  return new Promise((resolve) => {
    if (!fs.existsSync(videoPath)) {
      return resolve(false);
    }

    const ffmpegArgs = [
      "-i", videoPath,
      "-preset", "veryfast",
      "-g", "48",
      "-sc_threshold", "0",
      "-map", "0:v:0",
      "-map", "0:a:0?",
      "-c:v", "libx264",
      "-b:v", "3000k",
      "-f", "hls",
      "-hls_time", "6",
      "-hls_playlist_type", "vod",
      path.join(outputFolder, "master.m3u8")
    ];

    const ffmpeg = spawn("ffmpeg", ffmpegArgs, {
      stdio: "ignore"
    });

    ffmpeg.on("close", (code) => {
      resolve(code === 0);
    });

    ffmpeg.on("error", () => {
      resolve(false);
    });
  });
}

module.exports = { transcodeToHLS };