import fs from "node:fs";
import path from "node:path";

export function deleteUploadFiles(uploads) {
  for (const { file_path: filePath } of uploads) {
    const filename = filePath.startsWith("/uploads/") && filePath.slice("/uploads/".length);
    if (!filename || filename === "." || filename === ".." || /[/\\]/.test(filename)) continue;
    try {
      fs.unlinkSync(path.join(process.cwd(), "uploads", filename));
    } catch (error) {
      if (error.code !== "ENOENT") console.error("Could not remove cover file", error.code);
    }
  }
}
