// Copyright (c) 2025. Jericho Crosby (Chalwk)

package com.chalwk.data;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import net.dv8tion.jda.api.entities.User;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Map;

public class FlightDataManager {
    private static final Logger logger = LoggerFactory.getLogger(FlightDataManager.class);
    private static final ObjectMapper mapper = new ObjectMapper();
    private static final String FLIGHTS_FILE = "../data/flights.json";

    public static void saveFlight(User user, Map<String, String> flightPlan) {
        try {
            ObjectNode flight = mapper.createObjectNode();

            flight.put("id", generateFlightId());
            flight.put("date", LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE));
            flight.put("timestamp", LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME));
            flight.put("timestamp", LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME));
            flight.put("pilot", user.getName());
            flight.put("pilotId", user.getId());
            flight.put("pilotTag", user.getAsTag());
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
            flight.put("status", "completed");
            flight.put("source", "SimBrief");

            ArrayNode flightsArray;

            File file = new File(FLIGHTS_FILE);

            Path path = Paths.get(FLIGHTS_FILE);
            if (file.exists()) {
                String content = new String(Files.readAllBytes(path));
                flightsArray = (ArrayNode) mapper.readTree(content);
            } else {
                flightsArray = mapper.createArrayNode();
            }

            flightsArray.add(flight);

            String jsonToSave = mapper.writerWithDefaultPrettyPrinter().writeValueAsString(flightsArray);
            Files.write(path, jsonToSave.getBytes());

            logger.info("Flight saved locally for user: {}", user.getAsTag());

            commitToGitHub();

        } catch (Exception e) {
            logger.error("Error saving flight data", e);
        }
    }


    private static void commitToGitHub() {
        try {
            ProcessBuilder pb = new ProcessBuilder();
            pb.command("git", "add", "../data/flights.json");
            pb.directory(new File("../"));
            Process process = pb.start();
            process.waitFor();

            pb.command("git", "commit", "-m", "Auto-commit: New flight added via Discord bot");
            process = pb.start();
            process.waitFor();

            pb.command("git", "push");
            process = pb.start();
            process.waitFor();

            logger.info("Flight data committed to GitHub");
        } catch (Exception e) {
            logger.error("Failed to commit to GitHub: {}", e.getMessage());
        }
    }
    private static String generateFlightId() {
        return "CPA" + System.currentTimeMillis() % 10000;
    }

    private static String calculateDistance(Map<String, String> flightPlan) {
        // TODO: Implement actual distance calculation
        return flightPlan.getOrDefault("distance", "N/A");
    }
}