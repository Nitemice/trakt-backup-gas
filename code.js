var apiUrl = "https://api-v2launch.trakt.tv/users/";
var pathList = [
    "watchlist/movies",
    "watchlist/shows",
    "watchlist/seasons",
    "watchlist/episodes",
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


function grabJson(id)
{
    var file = DriveApp.getFileById(id).getAs("application/json");
    return JSON.parse(file.getDataAsString());
}

function findOrCreateFile(dir, name, content)
{
    var filename = String(name).replace("\/", "_") + ".json";
    var file;

    // See if there's already a file in the indicated Google Drive folder
    var backupFolder = DriveApp.getFolderById(dir);
    var files = backupFolder.getFilesByName(filename);
    if (files.hasNext())
    {
        file = files.next();
        // Set the file contents
        file.setContent(content.getDataAsString());
        Logger.log("Updated existing file: " + filename);
    }
    else
    {
        // Set the file contents
        file = backupFolder.createFile(content);
        // Set the file name
        file.setName(filename);
        Logger.log("Created new file: " + filename);
    }
    return file;
}

function getData(config, url)
{
    var headers = {
        "Authorization": "Bearer " + config.authToken,
        "Content-Type": "application/json",
        "trakt-api-version": "2",
        "trakt-api-key": config.clientId
    };

    var response = UrlFetchApp.fetch(url, {
        headers: headers
    });

    return response.getBlob();
}


function main()
{
    // Retrieve config file
    var config = grabJson(configId);

    // Refresh auth

    // Iterate over each of the paths to backup
    var userUrl = apiUrl + config.username + "/";
    for (path of pathList)
    {
        var url = userUrl + path;
        var data = getData(config, url, path);

        // Save the json file in the indicated Google Drive folder
        var file = findOrCreateFile(config.backupDir, path, data);
        // Logger.log("X");
    }
}