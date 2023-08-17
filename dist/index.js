"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const admin = __importStar(require("firebase-admin"));
const path = __importStar(require("path"));
const uuid_1 = require("uuid");
module.exports = {
    init(config) {
        admin.initializeApp({
            credential: admin.credential.cert(config.serviceAccount),
            // If you have a custom bucket, this will set that bucket
            storageBucket: config.bucket,
        });
        // We set the custom bucket in the storageBucket option in the firbase admin init config
        const bucket = admin.storage().bucket();
        /**
         * This will help debug any potential issues with the library and can
         * be turned on/off from the config
         */
        function print(message, ...optionalParams) {
            if (config.debug)
                console.log(message, ...optionalParams);
        }
        /**
         * Strapi creates multiple variants of the same image for thumbnails etc.
         * By default, Strapi will just output all the files in the base bucket, and
         * that can be kind of a pain in the ass to look at.
         *
         * This function will grab the base file name from file variants like
         * "thumbnail_fileName" so I can use that as a folder path.
         */
        function getFileFolder(fileName) {
            print("FILE NAME: ", fileName);
            const tagRgx = /thumbnail_|large_|small_|medium_/gi;
            const name = path.parse(fileName).name;
            print("FILE NAME WITHOUT EXTENSION: ", name);
            const folderName = name.split(tagRgx).find((x) => !!x);
            print("FOLDER NAME: ", folderName);
            return folderName;
        }
        /**
         * To add a layer of organization, I wanted to group all the images by their
         * type. Since we get the MIME type from the uploaded file from Strapi, we can use
         * that to help group images in Firebase Storage.
         */
        function mimeTypeFolderGenerator(mime) {
            const mimeRgx = /image|video|pdf|font|javascript|html/gi;
            const matches = mime.match(mimeRgx);
            print("MIME MATCHES: ", matches);
            if (matches && matches.length > 0) {
                let folderName = matches[0];
                print("FOLDER NAME: ", folderName);
                folderName = folderName.toLocaleLowerCase();
                print("FOLDER NAME: ", folderName);
                const normalizedFolderName = folderName.charAt(0).toUpperCase() + folderName.slice(1);
                print("NORMALIZED FOLDER NAME: ", normalizedFolderName);
                return normalizedFolderName;
            }
            return "";
        }
        /**
         * We need the file ref for all functions so it makes sense to get that here.
         */
        function getFileRef(file) {
            const fileName = `${file.hash}${file.ext}`;
            print("FILE NAME: ", fileName);
            const basePath = mimeTypeFolderGenerator(file.mime);
            print("FILE BASE PATH: ", basePath);
            const fileFolderName = getFileFolder(file.hash);
            print("FILE FOLDER NAME: ", fileFolderName);
            const fullFilePath = `${basePath ? `${basePath}/` : ""}${fileFolderName}/${fileName}`;
            print("FILE FULL PATH: ", fullFilePath);
            return bucket.file(config.sortInStorage ? fullFilePath : fileName);
        }
        const upload = (file) => new Promise((resolve, reject) => {
            const fileRef = getFileRef(file);
            const fileURL = `https://storage.googleapis.com/${config.bucket}/${fileRef.name}`;
            print("FILE URL: ", fileURL);
            const metadata = {
                metadata: {
                    firebaseStorageDownloadTokens: (0, uuid_1.v4)(),
                },
            };
            if (file.stream) {
                const writeStream = fileRef.createWriteStream({
                    public: true,
                    contentType: file.mime,
                    metadata,
                });
                file.stream
                    .pipe(writeStream)
                    .on("error", (error) => {
                    if (config.debug)
                        console.error(error);
                    print("\n\n");
                    reject(error);
                })
                    .on("finish", async () => {
                    /**
                     * We need to set the file.url because this will go into the database and
                     * will determine where the image is served from. If this isn't set, then
                     * it will break.
                     */
                    file.url = fileURL;
                    print("\n\n");
                    // Resolve just marks that the upload is complete
                    resolve("");
                });
            }
            else if (file.buffer) {
                const fileBuffer = Buffer.from(file.buffer);
                fileRef.save(fileBuffer, {
                    public: true,
                    contentType: file.mime,
                    metadata,
                }, async (error) => {
                    if (error) {
                        if (config.debug)
                            console.error(error);
                        print("\n\n");
                        reject(error);
                    }
                    /**
                     * We need to set the file.url because this will go into the database and
                     * will determine where the image is served from. If this isn't set, then
                     * it will break.
                     */
                    file.url = fileURL;
                    print("\n\n");
                    // Resolve just marks that the upload is complete
                    resolve("");
                });
            }
        });
        return {
            // We can have 1 function that handles file streams and buffers
            upload: (file) => upload(file),
            uploadStream: (file) => upload(file),
            delete: (file) => new Promise((resolve, reject) => {
                const fileRef = getFileRef(file);
                fileRef.exists().then(([exists]) => {
                    if (!exists) {
                        return resolve("");
                    }
                    fileRef
                        .delete()
                        .then(() => {
                        print("\n\n");
                        // Resolve just marks that the deletion is complete
                        resolve("");
                    })
                        .catch((error) => {
                        if (config.debug)
                            console.error(error);
                        print("\n\n");
                        reject(error);
                    });
                });
            }),
        };
    },
};
//# sourceMappingURL=index.js.map