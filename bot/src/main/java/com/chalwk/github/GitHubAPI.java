// Copyright (c) 2025. Jericho Crosby (Chalwk)

package com.chalwk.github;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.time.Duration;
import java.util.Base64;

public class GitHubAPI {
    private static final Logger logger = LoggerFactory.getLogger(GitHubAPI.class);
    private static final HttpClient client = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build();

    public static String readGitHubToken() {
        try {
            return Files.readString(Paths.get("github.token")).trim();
        } catch (IOException e) {
            logger.error("Failed to read GitHub token file", e);
        }
        return null;
    }

    public static boolean updateFile(String content, String commitMessage, String filePath) throws Exception {
        String token = readGitHubToken();
        if (token == null || token.isEmpty()) {
            logger.error("GitHub token not found or empty");
            return false;
        }

        String sha = getFileSHA(filePath);
        String requestBody = String.format("""
                {
                    "message": "%s",
                    "content": "%s",
                    "sha": "%s",
                    "branch": "main"
                }
                """, commitMessage, encodeToBase64(content), sha != null ? sha : "");

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create("https://api.github.com/repos/Chalwk/CPAS/contents/" + filePath))
                .header("Authorization", "token " + token)
                .header("Accept", "application/vnd.github.v3+json")
                .header("User-Agent", "CPAS-Discord-Bot")
                .header("Content-Type", "application/json")
                .PUT(HttpRequest.BodyPublishers.ofString(requestBody))
                .build();

        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());

        if (response.statusCode() == 200 || response.statusCode() == 201) {
            logger.info("File updated successfully: {} - {}", filePath, commitMessage);
            return true;
        } else {
            logger.error("GitHub API error: {} - {}", response.statusCode(), response.body());
            return false;
        }
    }

    public static boolean appendFlightToJSON(String flightData) {
        try {
            return updateFile(flightData, "Add flight via Discord ACARS", "data/flights.json");
        } catch (Exception e) {
            logger.error("Error saving flight to GitHub", e);
            return false;
        }
    }

    public static String getFlightsJSON() throws Exception {
        String token = readGitHubToken();
        if (token == null) return "[]";

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create("https://api.github.com/repos/Chalwk/CPAS/contents/data/flights.json"))
                .header("Authorization", "token " + token)
                .header("Accept", "application/vnd.github.v3.raw")
                .header("User-Agent", "CPAS-Discord-Bot")
                .GET()
                .build();

        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());

        if (response.statusCode() == 200) {
            return response.body();
        } else if (response.statusCode() == 404) {
            return "[]";
        }
        throw new Exception("Failed to fetch flights: " + response.statusCode());
    }

    private static String getFileSHA(String filePath) throws Exception {
        String token = readGitHubToken();
        if (token == null) return null;

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create("https://api.github.com/repos/Chalwk/CPAS/contents/" + filePath))
                .header("Authorization", "token " + token)
                .header("Accept", "application/vnd.github.v3+json")
                .header("User-Agent", "CPAS-Discord-Bot")
                .GET()
                .build();

        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());

        if (response.statusCode() == 200) {
            String body = response.body();
            int shaStart = body.indexOf("\"sha\":\"") + 7;
            int shaEnd = body.indexOf("\"", shaStart);
            if (shaStart > 6 && shaEnd > shaStart) {
                return body.substring(shaStart, shaEnd);
            }
            return null;
        } else if (response.statusCode() == 404) {
            return null;
        }
        throw new Exception("Failed to get file SHA: " + response.statusCode());
    }

    private static String encodeToBase64(String content) {
        return Base64.getEncoder().encodeToString(content.getBytes());
    }
}