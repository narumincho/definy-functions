import * as core from "definy-core";
import * as data from "definy-core/source/data";
import * as lib from "./lib";
import * as nHtml from "@narumincho/html";

export const html = async (
  urlData: data.UrlData,
  normalizedUrl: URL
): Promise<nHtml.Html> => ({
  appName: "Definy",
  pageName: "Definy",
  iconPath: ["icon"],
  coverImageUrl: await coverImageUrl(urlData.location),
  description: description(urlData.language, urlData.location),
  scriptUrlList: [new URL((core.releaseOrigin as string) + "/main.js")],
  styleUrlList: [],
  javaScriptMustBeAvailable: true,
  twitterCard: "SummaryCard",
  language: "Japanese",
  manifestPath: ["manifest.json"],
  url: new URL(normalizedUrl.toString()),
  style: `/*
    Hack typeface https://github.com/source-foundry/Hack
    License: https://github.com/source-foundry/Hack/blob/master/LICENSE.md
*/

@font-face {
    font-family: "Hack";
    font-weight: 400;
    font-style: normal;
    src: url("/hack-regular-subset.woff2") format("woff2");
}

html {
    height: 100%;
}

body {
    height: 100%;
    margin: 0;
    background-color: black;
    display: grid;
}

* {
    box-sizing: border-box;
    color: white;
}`,
  body: [nHtml.div({}, loadingMessage(urlData.language))],
});

const coverImageUrl = async (location: data.Location): Promise<URL> => {
  switch (location._) {
    case "Project": {
      const projectResource = await lib.getProject(location.projectId);
      if (projectResource.dataMaybe._ === "Just") {
        return new URL(
          "https://us-central1-definy-lang.cloudfunctions.net/getFile/" +
            (projectResource.dataMaybe.value.imageHash as string)
        );
      }
    }
  }
  return new URL((core.releaseOrigin as string) + "/icon");
};

const loadingMessage = (language: data.Language): string => {
  switch (language) {
    case "English":
      return "Loading Definy ...";
    case "Japanese":
      return "Definyを読込中……";
    case "Esperanto":
      return "Ŝarĝante Definy ...";
  }
};

const description = (
  language: data.Language,
  location: data.Location
): string => {
  switch (language) {
    case "English":
      return englishDescription(location);
    case "Japanese":
      return japaneseDescription(location);
    case "Esperanto":
      return esperantoDescription(location);
  }
};

const englishDescription = (location: data.Location): string => {
  switch (location._) {
    case "Home":
      return "Definy is Web App for Web App.";
    case "CreateProject":
      return "Project creation page";
    case "Project":
      return "Project page id=" + (location.projectId as string);
    case "User":
      return "User page id=" + (location.userId as string);
    case "Idea":
      return "Idea page id=" + (location.ideaId as string);
    case "Commit":
      return "commit page id=" + (location.commitId as string);
    case "Setting":
      return "setting page";
    case "About":
      return "About";
    case "Debug":
      return "Debug";
  }
};

const japaneseDescription = (location: data.Location): string => {
  switch (location._) {
    case "Home":
      return "ブラウザで動作する革新的なプログラミング言語!";
    case "CreateProject":
      return "プロジェクト作成ページ";
    case "Project":
      return "プロジェクト id=" + (location.projectId as string);
    case "User":
      return "ユーザー id=" + (location.userId as string);
    case "Idea":
      return "アイデア id=" + (location.ideaId as string);
    case "Commit":
      return "提案 id=" + (location.commitId as string);
    case "Setting":
      return "設定ページ";
    case "About":
      return "Definyについて";
    case "Debug":
      return "Debugページ";
  }
};

const esperantoDescription = (location: data.Location): string => {
  switch (location._) {
    case "Home":
      return "Noviga programlingvo, kiu funkcias en la retumilo";
    case "CreateProject":
      return "Projekto kreo de paĝo";
    case "Project":
      return "projektopaĝo id=" + (location.projectId as string);
    case "User":
      return "uzantopaĝo id=" + (location.userId as string);
    case "Idea":
      return "Ideopaĝo id=" + (location.ideaId as string);
    case "Commit":
      return "Kompromitipaĝo id=" + (location.commitId as string);
    case "Setting":
      return "Agordoj paĝo";
    case "About":
      return "pri paĝo";
    case "Debug":
      return "elpurigi paĝo";
  }
};
