
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

/**
 * Transcodifica um vídeo original para o formato HLS com múltiplas resoluções.
 * @param {string} videoPath - Caminho absoluto para o arquivo de vídeo original (.mp4)
 * @param {string} outputFolder - Caminho da pasta onde o HLS será gerado
 * @returns {Promise<boolean>} - Retorna true se a transcodificação foi bem-sucedida
 */
function transcodeToHLS(videoPath, outputFolder) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(videoPath)) {
      console.error("[Transcode] Arquivo de vídeo original não encontrado:", videoPath);
      return resolve(false);
    }

    // Cria as pastas de destino para cada variante se não existirem
    ['v0', 'v1', 'v2'].forEach(v => {
      const vDir = path.join(outputFolder, v);
      if (!fs.existsSync(vDir)) fs.mkdirSync(vDir, { recursive: true });
    });

    const ffmpegArgs = [
      "-i", videoPath,
      "-preset", "veryfast",
      "-g", "48",
      "-sc_threshold", "0",
      
      // Mapeamento 1080p
      "-map", "0:v:0", "-map", "0:a:0?",
      "-s:v:0", "1080x1920", "-c:v:0", "libx264", "-b:v:0", "5000k",
      
      // Mapeamento 720p
      "-map", "0:v:0", "-map", "0:a:0?",
      "-s:v:1", "720x1280", "-c:v:1", "libx264", "-b:v:1", "2800k",
      
      // Mapeamento 480p
      "-map", "0:v:0", "-map", "0:a:0?",
      "-s:v:2", "480x854", "-c:v:2", "libx264", "-b:v:2", "1400k",
      
      // Configuração HLS
      "-f", "hls",
      "-hls_time", "6",
      "-hls_playlist_type", "vod",
      "-hls_segment_filename", path.join(outputFolder, "v%v/fileSequence%d.ts"),
      "-master_pl_name", "master.m3u8",
      "-var_stream_map", "v:0,a:0 v:1,a:0 v:2,a:0",
      path.join(outputFolder, "v%v/prog_index.m3u8")
    ];

    console.log(`[Transcode] Iniciando FFmpeg para: ${path.basename(videoPath)}`);
    const ffmpeg = spawn("ffmpeg", ffmpegArgs);

    ffmpeg.on("close", (code) => {
      if (code === 0) {
        console.log("[Transcode] HLS Gerado com sucesso em:", outputFolder);
        resolve(true);
      } else {
        console.warn("[Transcode] FFmpeg encerrou com erro código:", code);
        resolve(false);
      }
    });

    ffmpeg.on("error", (err) => {
      console.error("[Transcode] Erro Crítico ao iniciar FFmpeg:", err.message);
      resolve(false);
    });
  });
}

module.exports = { transcodeToHLS };
