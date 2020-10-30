const authUrl = "https://api-v2launch.trakt.tv/oauth/token";
const apiUrl = "https://api-v2launch.trakt.tv/users/me/";
const pathList = [
    "?extended=full", // = profile info
    "collection/movies?extended=metadata",
    "collection/shows?extended=metadata",
    "comments/all?include_replies=true",
    "followers",
    "following",
    "friends",
    "history?limit=250",
    // "history/episodes",
    // "history/movies",
    // "history/seasons",
    // "history/shows",
    // "lists",
    "ratings/episodes",
    "ratings/movies",
    "ratings/seasons",
    "ratings/shows",
    "recommendations",
    "stats",
    "watched/movies",
    "watched/shows",
    "watchlist/episodes",
    "watchlist/movies",
    "watchlist/seasons",
    "watchlist/shows",
    //"likes" - no username
];


function grabJson(id)
{
    var file = DriveApp.getFileById(id).getAs("application/json");
    return JSON.parse(file.getDataAsString());
}

function findOrCreateFolder(parentDir, foldername)
{
    // See if there's already a folder in the indicated Google Drive folder
    var backupFolder = DriveApp.getFolderById(parentDir);
    var folders = backupFolder.getFoldersByName(foldername);

    if (folders.hasNext())
    {
        return folders.next();
    }
    else
    {
        // Create a new folder
        Logger.log("Created new folder: " + foldername);
        return backupFolder.createFolder(foldername);
    }
}

function findOrCreateFile(parentDir, filename, content)
{
    var file;

    // See if there's already a file in the indicated Google Drive folder
    var backupFolder = DriveApp.getFolderById(parentDir);
    var files = backupFolder.getFilesByName(filename);
    if (files.hasNext())
    {
        file = files.next();
        // Set the file contents
        file.setContent(content);
        Logger.log("Updated existing file: " + filename);
    }
    else
    {
        // Create a new file with content
        file = backupFolder.createFile(filename, content);
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

function backupCore(config)
{
    // Iterate over each of the paths to backup
    for (path of pathList)
    {
        var url = apiUrl + path;
        var data = getData(config, url);

        // Save the json file in the indicated Google Drive folder
        var filename = String(path).replace("\/", "_").split("?")[0];
        filename += ".json";
        var file = findOrCreateFile(config.backupDir, filename, data.getDataAsString());
        // Logger.log("X");
    }
}

function backupLists(config)
{
    // Make a folder for all list files
    var backupFolder = findOrCreateFolder(config.backupDir, "lists").getId();

    var baseUrl = apiUrl + "lists/";

    // Retrieve a list of all the lists
    var allLists = JSON.parse(getData(config, baseUrl).getDataAsString());

    // Iterate through the lists and retrieve each one
    for (list of allLists)
    {
        // Retrieve list items
        var path = list.ids.slug;
        var url = baseUrl + path;
        var listItems = JSON.parse(getData(config, url + "/items").getDataAsString());
        var listComments = JSON.parse(getData(config, url + "/comments").getDataAsString());

        // Add list items & comments to other list data
        list.items = listItems;
        list.comments = listComments;

        // Save the json file in the indicated Google Drive folder
        var file = findOrCreateFile(backupFolder, path + ".json", JSON.stringify(list));
        // Logger.log("X");
    }
}

function main()
{
    // Retrieve config file
    var config = grabJson(configId);

    // Refresh auth

    // Iterate over each of the paths to backup
    backupCore(config);

    // Request all lists separately
    backupLists(config);

}