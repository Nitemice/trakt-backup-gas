const authUrl = "https://api.trakt.tv/oauth/token";
const apiUrl = "https://api.trakt.tv/users/me/";
const pathList = [
    "?extended=full", // profile info
    "collection/movies?extended=metadata",
    "collection/shows?extended=metadata",
    "comments/all?include_replies=true",
    "followers",
    "following",
    "friends",
    "history/episodes?limit=250",
    "history/movies?limit=250",
    "ratings/episodes",
    "ratings/movies",
    "ratings/shows",
    "ratings/seasons",
    "ratings/episodes",
    "history/movies",
    "history/shows",
    "history/seasons",
    "history/episodes",
    "collection/movies",
    "collection/shows",
    "watched/movies",
    "watched/shows",
    "comments/all",
    "followers",
    "following"
];


function grabJson(id) {
    var file = DriveApp.getFileById(id).getAs("application/json");
    return JSON.parse(file.getDataAsString());
}

function findOrCreateFile(dir, name, content) {
    var filename = name.replace("\/", "_") + ".json";
    var file;

    // See if there's already a file in the indicated Google Drive folder
    var backupFolder = DriveApp.getFolderById(dir);
    var files = backupFolder.getFilesByName(filename);
    if (files.hasNext()) {
        file = files.next();
        // Set the file contents
        file.setContent(content.getDataAsString());
        Logger.log("Updated existing file: " + filename);
    }
    else {
        // Set the file contents
        file = backupFolder.createFile(content);
        // Set the file name
        file.setName(filename);
        Logger.log("Created new file: " + filename);
    }
}

function getData(config, baseUrl, path) {
    var headers = {
        "Authorization": "Bearer " + config.authToken,
        "Content-Type": "application/json",
        "trakt-api-version": "2",
        "trakt-api-key": config.clientId
    };

    var url = baseUrl + path;
    var response = UrlFetchApp.fetch(url, {
        headers: headers
    });

    // Save the json file in the indicated Google Drive folder
    var file = findOrCreateFile(config.backupDir, path, response.getBlob());
}


function main() {
    // Retrieve config file
    var config = grabJson(configId);

    // Refresh auth

    // Iterate over each of the paths to backup
    var userUrl = url + config.username + "/";
    for (path of pathList) {
        var backupUrl = userUrl + path;
        getData(config, backupUrl);
        Logger.log("X");
    }
}