import * as jimp from "jimp";
import { promises as fsPromise } from "fs";

export const createProjectIcon = async (): Promise<Buffer> => {
  const width = 64;
  const height = 64;
  const image = await jimp.create(width, height);
  drawRectRandomImage(image, 3, 3, 0.01);
  return image.getBufferAsync("image/png");
};

export const createProjectImage = async (): Promise<Buffer> => {
  const width = 1024;
  const height = 633;
  const image = await jimp.create(width, height);
  drawRectRandomImage(
    image,
    12 + Math.floor(Math.random() * 10),
    5 + Math.floor(Math.random() * 10),
    0.0004
  );
  return image.getBufferAsync("image/png");
};

const drawRectRandomImage = (
  image: jimp,
  xCount: number,
  yCount: number,
  change: number
): void => {
  const paletteSize = 8;
  const palette = new Array(8).fill(0).map(() => randomColor());

  const xSize = Math.floor(image.getWidth() / xCount + 1);
  const ySize = Math.floor(image.getHeight() / yCount + 1);

  let k = palette[0];
  for (let i = 0; i < xSize * ySize * xCount * yCount; i += 1) {
    if (Math.random() < change) {
      k = palette[Math.floor(Math.random() * paletteSize)];
    }
    image.setPixelColor(
      k,
      (Math.floor(i / ySize) + (i % xSize)) % (xSize * xCount),
      Math.floor(i / (xSize * xCount * ySize)) * ySize +
        (Math.floor(i / xSize) % ySize)
    );
  }
};

const randomColor = (): number =>
  jimp.rgbaToInt(
    (2 + Math.floor(Math.random() * 5)) * 32,
    (2 + Math.floor(Math.random() * 5)) * 32,
    (2 + Math.floor(Math.random() * 5)) * 32,
    255
  );

createProjectImage().then((buffer) => {
  fsPromise.writeFile("image.png", buffer);
});
