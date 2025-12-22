// Copyright (c) 2025. Jericho Crosby (Chalwk)

package com.chalwk.data;

import com.chalwk.github.GitHubAPI;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import net.dv8tion.jda.api.entities.User;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Map;

public class FlightDataManager {
    private static final Logger logger = LoggerFactory.getLogger(FlightDataManager.class);
    private static final ObjectMapper mapper = new ObjectMapper();

    public static void saveFlight(User user, Map<String, String> flightPlan, String simbriefPilotId, String status) {
        try {
            ObjectNode flight = mapper.createObjectNode();

            flight.put("id", generateFlightId());
            flight.put("lastUpdated", LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME));
            flight.put("date", LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE));
            flight.put("timestamp", LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME));
            flight.put("pilot", user.getName());
            flight.put("pilotId", simbriefPilotId);
            flight.put("flightNumber", flightPlan.getOrDefault("flight_number", "N/A"));
            flight.put("callsign", flightPlan.getOrDefault("callsign", "N/A"));
            flight.put("departure", flightPlan.getOrDefault("origin", "N/A"));
            flight.put("arrival", flightPlan.getOrDefault("destination", "N/A"));
            flight.put("alternate", flightPlan.getOrDefault("alternate", "N/A"));
            flight.put("aircraft", flightPlan.getOrDefault("aircraft_name", "N/A"));
            flight.put("aircraftIcao", flightPlan.getOrDefault("aircraft_icao", "N/A"));
            flight.put("aircraftReg", flightPlan.getOrDefault("aircraft_reg", "N/A"));
            flight.put("flightTime", flightPlan.getOrDefault("flight_time", "N/A"));
            flight.put("blockTime", flightPlan.getOrDefault("block_time", "N/A"));
            flight.put("route", flightPlan.getOrDefault("route_text", "DCT"));
            flight.put("cruiseAlt", flightPlan.getOrDefault("cruise_alt", "N/A"));
            flight.put("fuelBurn", flightPlan.getOrDefault("fuel_burn", "N/A"));
            flight.put("zfw", flightPlan.getOrDefault("zfw", "N/A"));
            flight.put("tow", flightPlan.getOrDefault("tow", "N/A"));
            flight.put("windComponent", flightPlan.getOrDefault("wind_component", "N/A"));
            flight.put("pdfUrl", flightPlan.getOrDefault("pdf_url", "N/A"));
            flight.put("distance", calculateDistance(flightPlan));
            flight.put("status", status);
            flight.put("source", "SimBrief");

            String existingJson = readExistingFlights();
            ArrayNode flightsArray;

            if (existingJson == null || existingJson.isEmpty()) {
                flightsArray = mapper.createArrayNode();
            } else {
                flightsArray = (ArrayNode) mapper.readTree(existingJson);
            }

            flightsArray.add(flight);

            String jsonToSave = mapper.writerWithDefaultPrettyPrinter().writeValueAsString(flightsArray);

            boolean success = GitHubAPI.appendFlightToJSON(jsonToSave);

            if (success) {
                logger.info("Flight saved for user: {} (SimBrief ID: {})", user.getAsTag(), simbriefPilotId);
            } else {
                logger.error("Failed to save flight for user: {} (SimBrief ID: {})", user.getAsTag(), simbriefPilotId);
            }

        } catch (Exception e) {
            logger.error("Error saving flight data", e);
        }
    }

    private static String generateFlightId() {
        return "CPA" + System.currentTimeMillis() % 10000;
    }

    private static String calculateDistance(Map<String, String> flightPlan) {
        // TODO: Implement actual distance calculation
        return flightPlan.getOrDefault("distance", "N/A");
    }

    private static String readExistingFlights() {
        try {
            String token = GitHubAPI.readGitHubToken();
            if (token == null) return "[]";

            HttpClient client = HttpClient.newHttpClient();
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
        } catch (Exception e) {
            logger.error("Error reading existing flights", e);
        }
        return "[]";
    }
}