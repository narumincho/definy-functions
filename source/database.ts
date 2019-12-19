import * as databaseLow from "./databaseLow";
import * as type from "./type";
import axios, { AxiosResponse } from "axios";
import { URL } from "url";
import * as definyFirestoreType from "definy-firestore-type";

/* ==========================================
                    User
   ==========================================
*/

/**
 * OpenId ConnectのStateを生成して保存する
 * リプレイアタックを防いだり、他のサーバーがつくマートのクライアントIDを使って発行しても自分が発行したものと見比べて識別できるようにする
 */
export const generateAndWriteLogInState = async (
  logInService: definyFirestoreType.OpenIdConnectProvider
): Promise<string> => {
  const state = type.createRandomId();
  await databaseLow.writeGoogleLogInState(logInService, state);
  return state;
};

/**
 * 指定したサービスのtateがDefinyによって発行したものかどうか調べ、あったらそのstateを削除する
 */
export const checkExistsAndDeleteState = async (
  provider: definyFirestoreType.OpenIdConnectProvider,
  state: string
): Promise<boolean> =>
  await databaseLow.existsGoogleStateAndDeleteAndGetUserId(provider, state);

/**
 * ユーザーの画像をURLから保存する
 * @param userId ユーザーID
 * @param url 画像を配信しているURL
 */
export const saveUserImageFromUrl = async (url: URL): Promise<string> => {
  const response: AxiosResponse<Buffer> = await axios.get(url.toString(), {
    responseType: "arraybuffer"
  });
  const mimeType: string = response.headers["content-type"];
  return await databaseLow.saveFile(response.data, mimeType);
};

/**
 * ソーシャルログインのアカウントからユーザーを取得する
 * @param logInServiceAndId
 */
export const getUserFromLogInService = async (
  logInServiceAndId: definyFirestoreType.OpenIdConnectProviderAndId
): Promise<(UserLowCost & { lastAccessToken: string }) | null> => {
  const userDataAndId = await databaseLow.searchUserByLogInServiceAndId(
    logInServiceAndId
  );
  if (userDataAndId === undefined) {
    return null;
  }
  const userData = await databaseLow.getUser(userDataAndId.id);

  return {
    ...databaseLowUserToLowCost({ id: userDataAndId.id, data: userData }),
    lastAccessToken: userDataAndId.data.lastAccessTokenHash
  };
};

type UserLowCost = {
  readonly id: definyFirestoreType.UserId;
  readonly name: string;
  readonly imageFileHash: definyFirestoreType.FileHash;
  readonly introduction: string;
  readonly createdAt: Date;
  readonly branches: ReadonlyArray<{
    id: definyFirestoreType.BranchId;
  }>;
  readonly likedProjects: ReadonlyArray<{
    id: definyFirestoreType.ProjectId;
  }>;
};

/**
 * ユーザーを追加する
 */
export const addUser = async (data: {
  name: string;
  imageId: definyFirestoreType.FileHash;
  openIdConnectProviderAndId: definyFirestoreType.OpenIdConnectProviderAndId;
}): Promise<{
  userId: definyFirestoreType.UserId;
  accessToken: definyFirestoreType.AccessToken;
}> => {
  const userId = type.createRandomId() as definyFirestoreType.UserId;
  const accessToken = await createAccessToken(userId);
  await databaseLow.addUser(
    userId,
    {
      name: data.name,
      imageHash: data.imageId,
      introduction: "",
      createdAt: databaseLow.getNowTimestamp(),
      branchIds: [],
      likedProjectIds: []
    },
    {
      openIdConnect: data.openIdConnectProviderAndId,
      lastAccessTokenHash: type.hashAccessToken(accessToken),
      bookmarkedProjectIds: [],
      corkBoardParts: []
    }
  );
  return { userId: userId, accessToken: accessToken };
};

/**
 * ユーザーの情報を取得する
 * @param userId
 */
export const getUser = async (
  userId: definyFirestoreType.UserId
): Promise<UserLowCost> =>
  databaseLowUserToLowCost({
    id: userId,
    data: await databaseLow.getUser(userId)
  });

/**
 *  全てのユーザーの情報を取得する
 */
export const getAllUser = async (): Promise<Array<UserLowCost>> =>
  (await databaseLow.getAllUser()).map(databaseLowUserToLowCost);

const databaseLowUserToLowCost = ({
  id,
  data
}: {
  id: definyFirestoreType.UserId;
  data: definyFirestoreType.User;
}): UserLowCost => ({
  id: id,
  name: data.name,
  imageFileHash: data.imageHash,
  introduction: data.introduction,
  createdAt: data.createdAt.toDate(),
  branches: data.branchIds.map(id => ({ id: id }))
});

/**
 * 最後のアクセストークンを変更する
 * @param userId
 * @param accessToken
 */
export const updateLastAccessToken = async (
  userId: definyFirestoreType.UserId,
  accessToken: definyFirestoreType.AccessToken
): Promise<void> => {
  await databaseLow.updateUserSecret(userId, {
    lastAccessTokenHash: type.hashAccessToken(accessToken)
  });
};
/* ==========================================
                Project
   ==========================================
*/

type ProjectLowCost = {
  readonly id: definyFirestoreType.ProjectId;
  readonly masterBranch: {
    readonly id: definyFirestoreType.BranchId;
  };
  readonly branches: ReadonlyArray<{
    readonly id: definyFirestoreType.BranchId;
  }>;
  readonly statableReleasedCommitHashes: ReadonlyArray<{
    readonly hash: definyFirestoreType.CommitHash;
  }>;
  readonly betaReleasedCommitHashes: ReadonlyArray<{
    readonly hash: definyFirestoreType.CommitHash;
  }>;
};

/**
 * プロジェクトを追加する
 */
export const addProject = async (
  userId: definyFirestoreType.UserId,
  projectName: string
): Promise<ProjectLowCost> => {
  const masterBranchId = type.createRandomId() as definyFirestoreType.BranchId;

  const initialCommitHash = (
    await addCommit({
      branchId: masterBranchId,
      commitDescription: "initial commit",
      dependencies: [],
      parentCommitHashes: [],
      projectSummary: "",
      projectDescription: "",
      projectName: "",
      projectIconHash: null,
      projectImageHash: null,
      children: [],
      partDefs: [],
      typeDefs: []
    })
  ).hash;
  const projectId = await databaseLow.addProject({
    branches: [],
    masterBranch: masterBranchId,
    statableReleasedCommitHashes: [],
    betaReleasedCommitHashes: []
  });
  // TODO Draftコミッt作成時にハッシュ値はいらない?
  const draftCommitHash = await databaseLow.addDraftCommit({
    projectName: projectName,
    projectDescription: "",
    projectIcon: "fileHashDammy" as definyFirestoreType.FileHash,
    children: [],
    date: databaseLow.getNowTimestamp(),
    dependencies: [],
    description: "",
    hash: "draftCommitHashDammy" as definyFirestoreType.DraftCommitHash,
    isRelease: false,
    partDefs: [],
    projectImage: "fileHashDammy" as definyFirestoreType.FileHash,
    projectSummary: "",
    typeDefs: []
  });
  await databaseLow.addBranch(masterBranchId, {
    description: "プロジェクト作成時に自動的に作られるマスターブランチ",
    headCommitHash: initialCommitHash,
    name: type.labelFromString("master"),
    projectId: projectId,
    ownerId: userId,
    draftCommit: draftCommitHash
  });

  return {
    id: projectId,
    branches: [],
    masterBranch: {
      id: masterBranchId
    },
    statableReleasedCommitHashes: [],
    betaReleasedCommitHashes: []
  };
};

/**
 * プロジェクトの情報を取得する
 */
export const getProject = async (
  projectId: definyFirestoreType.ProjectId
): Promise<ProjectLowCost> => {
  return databaseLowProjectToLowCost({
    id: projectId,
    data: await databaseLow.getProject(projectId)
  });
};

/**
 * 全てのプロジェクトのデータを取得する
 */
export const getAllProject = async (): Promise<Array<ProjectLowCost>> =>
  (await databaseLow.getAllProject()).map(databaseLowProjectToLowCost);

const databaseLowProjectToLowCost = ({
  id,
  data
}: {
  id: definyFirestoreType.ProjectId;
  data: definyFirestoreType.Project;
}): ProjectLowCost => ({
  id: id,
  branches: data.branches.map(id => ({ id: id })),
  masterBranch: { id: data.masterBranch },
  betaReleasedCommitHashes: data.betaReleasedCommitHashes.map(hash => ({
    hash
  })),
  statableReleasedCommitHashes: data.statableReleasedCommitHashes.map(hash => ({
    hash
  }))
});

/* ==========================================
                Branch
   ==========================================
*/
type BranchLowCost = {
  readonly id: definyFirestoreType.BranchId;
  readonly name: definyFirestoreType.Label;
  readonly project: {
    readonly id: definyFirestoreType.ProjectId;
  };
  readonly description: string;
  readonly head: {
    readonly hash: definyFirestoreType.CommitHash;
  };
  readonly owner: {
    readonly id: definyFirestoreType.UserId;
  };
  readonly draftCommit: null | {
    readonly hash: definyFirestoreType.DraftCommitHash;
  };
};

/**
 * 分岐元なしのブランチを作成する
 */
export const addBranch = async (
  name: definyFirestoreType.Label,
  description: string,
  projectId: definyFirestoreType.ProjectId,
  userId: definyFirestoreType.UserId,
  commitDescription: string,
  dependencies: ReadonlyArray<definyFirestoreType.CommitHash>,
  parentCommitHashes: ReadonlyArray<definyFirestoreType.CommitHash>,
  projectName: string,
  projectIconHash: definyFirestoreType.FileHash,
  projectImageHash: definyFirestoreType.FileHash,
  projectSummary: string,
  projectDescription: string,
  children: ReadonlyArray<{
    id: definyFirestoreType.ModuleId;
    hash: definyFirestoreType.ModuleSnapshotHash;
  }>,
  typeDefs: ReadonlyArray<{
    id: definyFirestoreType.TypeId;
    hash: definyFirestoreType.TypeDefSnapshotHash;
  }>,
  partDefs: ReadonlyArray<{
    id: definyFirestoreType.PartId;
    hash: definyFirestoreType.PartDefSnapshotHash;
  }>
): Promise<BranchLowCost> => {
  const branchId = type.createRandomId() as definyFirestoreType.BranchId;

  const branchHeadCommitHash = (
    await addCommit({
      branchId: branchId,
      commitDescription: commitDescription,
      dependencies: dependencies,
      parentCommitHashes: parentCommitHashes,
      projectName: projectName,
      projectIconHash: projectIconHash,
      projectImageHash: projectImageHash,
      projectSummary: projectSummary,
      projectDescription: projectDescription,
      partDefs: partDefs,
      typeDefs: typeDefs,
      children: children
    })
  ).hash;

  const draftCommitWithOutDate: Pick<definyFirestoreType.DraftCommit, "date">;
  const draftCommitHash = type.createHash({});
  const draftCommit = await databaseLow.addDraftCommit({
    hash: hash
  });

  await databaseLow.addBranch(branchId, {
    name: name,
    description: description,
    projectId: projectId,
    headHash: branchHeadCommitHash,
    ownerId: userId,
    draftCommit: branchHeadCommitHash
  });
  return {
    id: branchId,
    name: name,
    description: description,
    project: { id: projectId },
    head: { hash: branchHeadCommitHash },
    owner: { id: userId },
    draftCommit: null
  };
};

export const getBranch = async (
  id: definyFirestoreType.BranchId
): Promise<BranchLowCost> =>
  databaseLowBranchToLowCost({
    id: id,
    data: await databaseLow.getBranch(id)
  });

const databaseLowBranchToLowCost = ({
  id,
  data
}: {
  id: definyFirestoreType.BranchId;
  data: definyFirestoreType.Branch;
}): BranchLowCost => ({
  id: id,
  name: data.name,
  project: {
    id: data.projectId
  },
  description: data.description,
  head: { hash: data.headCommitHash },
  owner: { id: data.ownerId },
  draftCommit: null
});

/* ==========================================
                   Commit
   ==========================================
*/
type CommitLowCost = {
  readonly hash: definyFirestoreType.CommitHash;
  readonly parentCommits: ReadonlyArray<{
    readonly hash: definyFirestoreType.CommitHash;
  }>;
  readonly branch: {
    readonly id: definyFirestoreType.BranchId;
  };
  readonly date: Date;
  readonly commitDescription: string;
  readonly projectName: string;
  readonly projectIcon: {
    hash: definyFirestoreType.FileHash | null;
  };
  readonly projectImage: {
    hash: definyFirestoreType.FileHash | null;
  };
  readonly projectSummary: string;
  readonly projectDescription: string;
  readonly children: ReadonlyArray<{
    readonly id: definyFirestoreType.ModuleId;
    readonly snapshot: {
      readonly hash: definyFirestoreType.ModuleSnapshotHash;
    };
  }>;
  readonly typeDefs: ReadonlyArray<{
    readonly id: definyFirestoreType.TypeId;
    readonly snapshot: {
      readonly hash: definyFirestoreType.TypeDefSnapshotHash;
    };
  }>;
  readonly partDefs: ReadonlyArray<{
    readonly id: definyFirestoreType.PartId;
    readonly snapshot: {
      readonly hash: definyFirestoreType.PartDefSnapshotHash;
    };
  }>;
  readonly dependencies: ReadonlyArray<{
    readonly hash: definyFirestoreType.CommitHash;
  }>;
};

export const addCommit = async (data: {
  parentCommitHashes: ReadonlyArray<definyFirestoreType.CommitHash>;
  branchId: definyFirestoreType.BranchId;
  commitDescription: string;
  projectName: string;
  projectIconHash: definyFirestoreType.FileHash | null;
  projectImageHash: definyFirestoreType.FileHash | null;
  projectSummary: string;
  projectDescription: string;
  children: ReadonlyArray<{
    id: definyFirestoreType.ModuleId;
    hash: definyFirestoreType.ModuleSnapshotHash;
  }>;
  typeDefs: ReadonlyArray<{
    id: definyFirestoreType.TypeId;
    hash: definyFirestoreType.TypeDefSnapshotHash;
  }>;
  partDefs: ReadonlyArray<{
    id: definyFirestoreType.PartId;
    hash: definyFirestoreType.PartDefSnapshotHash;
  }>;
  dependencies: ReadonlyArray<definyFirestoreType.CommitHash>;
}): Promise<CommitLowCost> => {
  const now = databaseLow.getNowTimestamp();
  const commitHash = await databaseLow.addCommit({
    date: now,
    ...data
  });
  return databaseLowCommitToLowCost({
    hash: commitHash,
    data: { date: now, ...data }
  });
};

export const getCommit = async (
  hash: definyFirestoreType.CommitHash
): Promise<CommitLowCost> =>
  databaseLowCommitToLowCost({
    hash: hash,
    data: await databaseLow.getCommit(hash)
  });

const databaseLowCommitToLowCost = ({
  hash,
  data
}: {
  hash: definyFirestoreType.CommitHash;
  data: definyFirestoreType.Commit;
}): CommitLowCost => ({
  hash: hash,
  parentCommits: data.parentCommitHashes.map(hash => ({ hash: hash })),
  branch: {
    id: data.branchId
  },
  date: data.date.toDate(),
  description: data.commitDescription,
  projectName: data.projectName,
  projectIcon: { hash: data.projectIconHash },
  projectImage: { hash: data.projectImageHash },
  projectSummary: data.projectSummary,
  projectDescription: data.projectDescription,
  children: data.children.map(child => ({
    id: child.id,
    snapshot: { hash: child.hash }
  })),
  typeDefs: data.typeDefs.map(t => ({
    id: t.id,
    snapshot: { hash: t.hash }
  })),
  partDefs: data.partDefs.map(p => ({
    id: p.id,
    snapshot: { hash: p.hash }
  })),
  dependencies: data.dependencies.map(hash => ({ hash }))
});

/* ==========================================
               Draft Commit
   ==========================================
*/
type DraftCommitLowCost = {
  readonly hash: definyFirestoreType.DraftCommitHash;
  readonly date: Date;
  readonly description: string;
  readonly isRelease: boolean;
  readonly projectName: string;
  readonly projectIconHash: definyFirestoreType.FileHash;
  readonly projectImageHash: definyFirestoreType.FileHash;
  readonly projectSummary: string;
  readonly projectDescription: string;
  readonly children: ReadonlyArray<{
    readonly id: definyFirestoreType.ModuleId;
    readonly snapshot: {
      readonly hash: definyFirestoreType.ModuleSnapshotHash;
    };
  }>;
  readonly typeDefs: ReadonlyArray<{
    readonly id: definyFirestoreType.TypeId;
    readonly snapshot: {
      readonly hash: definyFirestoreType.TypeDefSnapshotHash;
    };
  }>;
  readonly partDefs: ReadonlyArray<{
    readonly id: definyFirestoreType.PartId;
    readonly snapshot: {
      readonly hash: definyFirestoreType.PartDefSnapshotHash;
    };
  }>;
  readonly dependencies: ReadonlyArray<{
    readonly hash: definyFirestoreType.CommitHash;
  }>;
};

export const getDraftCommit = async (
  hash: definyFirestoreType.DraftCommitHash
): Promise<DraftCommitLowCost> =>
  databaseLowDraftCommitToLowCost({
    hash: hash,
    data: await databaseLow.getDraftCommit(hash)
  });

const databaseLowDraftCommitToLowCost = ({
  hash,
  data
}: {
  hash: definyFirestoreType.DraftCommitHash;
  data: definyFirestoreType.DraftCommit;
}): DraftCommitLowCost => ({
  hash: hash,
  date: data.date.toDate(),
  description: data.description,
  isRelease: data.isRelease,
  projectName: data.projectName,
  projectIconHash: data.projectIcon,
  projectImageHash: data.projectImage,
  projectSummary: data.projectSummary,
  projectDescription: data.projectDescription,
  children: data.children.map(child => ({
    id: child.id,
    snapshot: { hash: child.hash }
  })),
  typeDefs: data.typeDefs.map(t => ({
    id: t.id,
    snapshot: { hash: t.hash }
  })),
  partDefs: data.partDefs.map(p => ({
    id: p.id,
    snapshot: { hash: p.hash }
  })),
  dependencies: data.dependencies.map(hash => ({ hash }))
});

/* ==========================================
               Module Snapshot
   ==========================================
*/
type ModuleSnapshotLowCost = {
  readonly hash: definyFirestoreType.ModuleSnapshotHash;
  readonly name: definyFirestoreType.Label;
  readonly children: ReadonlyArray<{
    readonly id: definyFirestoreType.ModuleId;
    readonly snapshot: {
      readonly hash: definyFirestoreType.ModuleSnapshotHash;
    };
  }>;
  readonly typeDefs: ReadonlyArray<{
    readonly id: definyFirestoreType.TypeId;
    readonly snapshot: {
      readonly hash: definyFirestoreType.TypeDefSnapshotHash;
    };
  }>;
  readonly partDefs: ReadonlyArray<{
    readonly id: definyFirestoreType.PartId;
    readonly snapshot: {
      readonly hash: definyFirestoreType.PartDefSnapshotHash;
    };
  }>;
  readonly description: string;
  readonly exposing: boolean;
};

const databaseLowModuleSnapshotToLowCost = (hashAndData: {
  hash: definyFirestoreType.ModuleSnapshotHash;
  data: definyFirestoreType.ModuleSnapshot;
}): ModuleSnapshotLowCost => ({
  hash: hashAndData.hash,
  name: hashAndData.data.name,
  children: hashAndData.data.children.map(m => ({
    id: m.id,
    snapshot: { hash: m.hash }
  })),
  typeDefs: hashAndData.data.typeDefs.map(t => ({
    id: t.id,
    snapshot: { hash: t.hash }
  })),
  partDefs: hashAndData.data.partDefs.map(p => ({
    id: p.id,
    snapshot: { hash: p.hash }
  })),
  description: hashAndData.data.description,
  exposing: hashAndData.data.exposing
});

export const addModuleSnapshot = async (
  data: definyFirestoreType.ModuleSnapshot
): Promise<ModuleSnapshotLowCost> => {
  const hash = await databaseLow.addModuleSnapshot(data);
  return databaseLowModuleSnapshotToLowCost({
    hash: hash,
    data: data
  });
};

/**
 * 指定したモジュールのスナップショットを取得する
 */
export const getModuleSnapshot = async (
  hash: definyFirestoreType.ModuleSnapshotHash
): Promise<ModuleSnapshotLowCost> =>
  databaseLowModuleSnapshotToLowCost({
    hash: hash,
    data: await databaseLow.getModuleSnapshot(hash)
  });

/* ==========================================
               Type Def Snapshot
   ==========================================
*/
type TypeDefSnapshotLowCost = {
  id: definyFirestoreType.TypeId;
  hash: definyFirestoreType.TypeDefSnapshotHash;
  name: definyFirestoreType.Label;
  description: string;
  body: definyFirestoreType.TypeBody;
};

export const addTypeDefSnapshot = async (
  name: definyFirestoreType.Label,
  description: string,
  body: definyFirestoreType.TypeBody
): Promise<TypeDefSnapshotLowCost> => {
  const id = type.createRandomId() as definyFirestoreType.TypeId;
  const hash = await databaseLow.addTypeDefSnapshot({
    id: id,
    name: name,
    description: description,
    body: body
  });
  return {
    id: id,
    hash: hash,
    name: name,
    description: description,
    body: body
  };
};

const databaseLowTypeDefSnapshotToLowCost = ({
  hash,
  data
}: {
  hash: definyFirestoreType.TypeDefSnapshotHash;
  data: definyFirestoreType.TypeDefSnapshot;
}): TypeDefSnapshotLowCost => ({
  hash: hash,
  id: data.id,
  name: data.name,
  description: data.description,
  body: data.body
});

export const getTypeDefSnapshot = async (
  hash: definyFirestoreType.TypeDefSnapshotHash
): Promise<TypeDefSnapshotLowCost> =>
  databaseLowTypeDefSnapshotToLowCost({
    hash: hash,
    data: await databaseLow.getTypeDefSnapshot(hash)
  });

/* ==========================================
               Part Def Snapshot
   ==========================================
*/
type PartDefSnapshotLowCost = {
  readonly hash: definyFirestoreType.PartDefSnapshotHash;
  readonly id: definyFirestoreType.PartId;
  readonly name: definyFirestoreType.Label;
  readonly description: string;
  readonly type: ReadonlyArray<definyFirestoreType.TypeTermOrParenthesis>;
  readonly expr: {
    readonly hash: definyFirestoreType.ExprSnapshotHash;
    readonly body: string;
  };
};

export const addPartDefSnapshot = async (data: {
  id: definyFirestoreType.PartId;
  name: definyFirestoreType.Label;
  description: string;
  exprType: ReadonlyArray<definyFirestoreType.TypeTermOrParenthesis>;
  expr: definyFirestoreType.ExprBody;
}): Promise<PartDefSnapshotLowCost> => {
  const exprHashAndBody = {
    hash: type.createHash(data.expr) as definyFirestoreType.ExprSnapshotHash,
    body: JSON.stringify(data.expr)
  };

  const hash = await databaseLow.addPartDefSnapshot({
    id: data.id,
    name: data.name,
    description: data.description,
    type: data.exprType,
    expr: exprHashAndBody
  });
  return {
    hash: hash,
    id: data.id,
    name: data.name,
    description: data.description,
    type: data.exprType,
    expr: exprHashAndBody
  };
};

const databaseLowPartDefSnapshotToLowCost = (hashAndData: {
  hash: definyFirestoreType.PartDefSnapshotHash;
  data: definyFirestoreType.PartDefSnapshot;
}): PartDefSnapshotLowCost => ({
  hash: hashAndData.hash,
  id: hashAndData.data.id,
  name: hashAndData.data.name,
  description: hashAndData.data.description,
  type: hashAndData.data.type,
  expr: { body: hashAndData.data.expr.body, hash: hashAndData.data.expr.hash }
});

export const getPartDefSnapshot = async (
  hash: definyFirestoreType.PartDefSnapshotHash
): Promise<PartDefSnapshotLowCost> =>
  databaseLowPartDefSnapshotToLowCost({
    hash: hash,
    data: await databaseLow.getPartDefSnapShot(hash)
  });

/* ==========================================
                AccessToken
   ==========================================
*/

/**
 * アクセストークンを生成して、DBに保存する
 * @param accessToken
 */
export const createAccessToken = async (
  userId: definyFirestoreType.UserId
): Promise<definyFirestoreType.AccessToken> => {
  const accessToken = type.createAccessToken();
  await databaseLow.createAndWriteAccessToken(
    type.hashAccessToken(accessToken),
    {
      userId: userId,
      issuedAt: databaseLow.getNowTimestamp()
    }
  );
  return accessToken;
};
/**
 * アクセストークンの正当性チェックとuserIdの取得
 * @param accessToken
 */
export const verifyAccessToken = async (
  accessToken: definyFirestoreType.AccessToken
): Promise<definyFirestoreType.UserId> =>
  await databaseLow.verifyAccessToken(type.hashAccessToken(accessToken));
