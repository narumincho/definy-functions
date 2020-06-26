import * as kuromozi from "kuromoji";

let tokenizerCache: null | kuromozi.Tokenizer<kuromozi.IpadicFeatures> = null;

export const tokenize = (text: string): Promise<ReadonlyArray<string>> =>
  new Promise((resolve, reject) => {
    if (tokenizerCache !== null) {
      resolve(getNounList(tokenizerCache, text));
      return;
    }
    kuromozi
      .builder({ dicPath: "./node_modules/kuromoji/dict" })
      .build((err, tokenizer) => {
        if (err !== undefined) {
          reject(err);
          return;
        }
        tokenizerCache = tokenizer;
        resolve(getNounList(tokenizer, text));
      });
  });

const getNounList = (
  tokenizer: kuromozi.Tokenizer<kuromozi.IpadicFeatures>,
  text: string
): ReadonlyArray<string> => {
  return tokenizer
    .tokenize(text)
    .filter((w) => w.pos === "名詞")
    .map((e) => e.basic_form);
};
