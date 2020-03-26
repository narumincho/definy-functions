import * as canvas from "canvas";

export const createProjectIconFromChar = (char: string): Buffer => {
  char = char[0];
  const width = 64;
  const height = 64;
  const iconCanvas = canvas.createCanvas(width, height);
  const context = iconCanvas.getContext("2d");

  context.fillStyle = "#000000";
  context.fillRect(0, 0, width, height);

  context.fillStyle = "#ffffff";
  context.font = "48px 'Noto Sans'";

  const textMetrics = context.measureText(char);

  const textHeight =
    textMetrics.actualBoundingBoxAscent + textMetrics.actualBoundingBoxDescent;
  context.fillText(
    char,
    (width - textMetrics.width) / 2,
    (height - textHeight) / 2 + textMetrics.actualBoundingBoxAscent
  );

  return iconCanvas.toBuffer("image/png");
};

export const createProjectImage = (text: string): Buffer => {
  const width = 1024;
  const height = 633;
  const iconCanvas = canvas.createCanvas(width, height);
  const context = iconCanvas.getContext("2d");

  context.fillStyle = "#000000";
  context.fillRect(0, 0, width, height);

  context.fillStyle = "#ffffff";
  context.font = "48px 'Noto Sans'";

  const textMetrics = context.measureText(text);

  const textHeight =
    textMetrics.actualBoundingBoxAscent + textMetrics.actualBoundingBoxDescent;
  context.fillText(
    text,
    (width - textMetrics.width) / 2,
    (height - textHeight) / 2 + textMetrics.actualBoundingBoxAscent
  );

  return iconCanvas.toBuffer("image/png");
};
