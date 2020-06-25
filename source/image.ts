import * as jimp from "jimp";

export const createProjectIconFromChar = async (
  char: string
): Promise<Buffer> => {
  const width = 64;
  const height = 64;
  const image = await jimp.create(width, height);
  return image.getBufferAsync("image/png");
};

export const createProjectImage = async (text: string): Promise<Buffer> => {
  const width = 1024;
  const height = 633;
  const image = await jimp.create(width, height);
  return image.getBufferAsync("image/png");
};
