/* Copyright (c) 2025. Jericho Crosby (Chalwk) */

package com.chalwk.data;

import com.chalwk.api.GitHubAPI;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import net.dv8tion.jda.api.entities.User;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Map;

public class FlightDataManager {
    private static final Logger logger = LoggerFactory.getLogger(FlightDataManager.class);
    private static final ObjectMapper mapper = new ObjectMapper();
    private static final long CACHE_DURATION_MS = 30000;
    private static String cachedFlightsJson = null;
    private static long lastCacheUpdate = 0;

    public static void saveFlight(User user, Map<String, String> flightPlan, String simbriefPilotId, String status) {
        try {
            ObjectNode flight = mapper.createObjectNode();

            String flightId = flightPlan.getOrDefault("source", "SimBrief").equals("MissionReport")
                    ? "MSN" + System.currentTimeMillis() % 10000
                    : flightPlan.getOrDefault("flight_number", generateFlightId());

            String source = flightPlan.getOrDefault("source", "SimBrief");
            if ("SimBrief".equals(source)) {
                if (isDuplicateFlight(flightId, simbriefPilotId)) {
                    logger.warn("Duplicate SimBrief flight detected: Plan ID {} for pilot {}",
                            flightId, simbriefPilotId);
                    return;
                }
            }

            flight.put("departure_date", flightPlan.getOrDefault("departure_date", "N/A"));
            flight.put("departure_time_utc", flightPlan.getOrDefault("departure_time_utc", "N/A"));
            flight.put("arrival_time_utc", flightPlan.getOrDefault("arrival_time_utc", "N/A"));
            flight.put("scheduled_departure", flightPlan.getOrDefault("scheduled_departure", "N/A"));
            flight.put("scheduled_arrival", flightPlan.getOrDefault("scheduled_arrival", "N/A"));

            if (!flightPlan.containsKey("departure_date")) {
                flight.put("departure_date", LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE));
            }

            flight.put("id", flightId);
            flight.put("lastUpdated", LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME));
            flight.put("date", LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE));
            flight.put("timestamp", LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME));
            flight.put("pilot", user.getName());
            flight.put("pilotId", simbriefPilotId);
            flight.put("flightNumber", flightId);
            flight.put("callsign", flightPlan.getOrDefault("callsign", "N/A"));
            flight.put("departure", flightPlan.getOrDefault("origin", "N/A"));
            flight.put("arrival", flightPlan.getOrDefault("destination", "N/A"));
            flight.put("alternate", flightPlan.getOrDefault("alternate", "N/A"));
            flight.put("aircraft", flightPlan.getOrDefault("aircraft_name", "N/A"));
            flight.put("aircraftIcao", flightPlan.getOrDefault("aircraft_icao", "N/A"));
            flight.put("aircraftReg", flightPlan.getOrDefault("aircraft_reg", "N/A"));
            flight.put("flightTime", flightPlan.getOrDefault("flight_time", "N/A"));
            flight.put("blockTime", flightPlan.getOrDefault("block_time", flightPlan.getOrDefault("flight_time", "N/A")));
            flight.put("route", flightPlan.getOrDefault("route_text", "DCT"));
            flight.put("cruiseAlt", flightPlan.getOrDefault("cruise_alt", "N/A"));
            flight.put("route_distance", flightPlan.getOrDefault("route_distance", "N/A"));
            flight.put("status", status);
            flight.put("source", source);

            if (flightPlan.containsKey("mission_type")) {
                flight.put("missionType", flightPlan.get("mission_type"));
            }
            if (flightPlan.containsKey("mission_details")) {
                flight.put("missionDetails", flightPlan.get("mission_details"));
            }
            if (flightPlan.containsKey("patients")) {
                flight.put("patients", flightPlan.get("patients"));
            }
            if (flightPlan.containsKey("weather")) {
                flight.put("weather", flightPlan.get("weather"));
            }
            if (flightPlan.containsKey("challenges")) {
                flight.put("challenges", flightPlan.get("challenges"));
            }
            if (flightPlan.containsKey("notes")) {
                flight.put("notes", flightPlan.get("notes"));
            }
            if (flightPlan.containsKey("pax_count")) {
                flight.put("pax_count", flightPlan.get("pax_count"));
            }

            String existingJson = getExistingFlights();
            ArrayNode flightsArray;

            if (existingJson == null || existingJson.isEmpty()) {
                flightsArray = mapper.createArrayNode();
            } else {
                flightsArray = (ArrayNode) mapper.readTree(existingJson);
            }

            flightsArray.add(flight);

            String jsonToSave = mapper.writerWithDefaultPrettyPrinter().writeValueAsString(flightsArray);

            String commitMessage = flightPlan.getOrDefault("source", "SimBrief").equals("MissionReport")
                    ? "Add mission report via Discord"
                    : "Add flight via Discord ACARS";

            boolean success = GitHubAPI.updateFile(jsonToSave, commitMessage, "data/flights.json");

            if (success) {
                logger.info("Flight saved for user: {} (ID: {})", user.getAsTag(), simbriefPilotId);
                cachedFlightsJson = null;
                lastCacheUpdate = 0;
            } else {
                logger.error("Failed to save flight for user: {} (ID: {})", user.getAsTag(), simbriefPilotId);
            }

        } catch (Exception e) {
            logger.error("Error saving flight data", e);
        }
    }

    private static boolean isDuplicateFlight(String planId, String pilotId) {
        try {
            String existingJson = getExistingFlights();
            if (existingJson == null || existingJson.isEmpty() || existingJson.equals("[]")) {
                return false;
            }

            ArrayNode flightsArray = (ArrayNode) mapper.readTree(existingJson);

            for (int i = 0; i < flightsArray.size(); i++) {
                var flight = flightsArray.get(i);
                String existingId = flight.has("id") ? flight.get("id").asText() : null;
                String existingPilotId = flight.has("pilotId") ? flight.get("pilotId").asText() : null;
                String existingSource = flight.has("source") ? flight.get("source").asText() : null;

                if (planId.equals(existingId) &&
                        pilotId.equals(existingPilotId) &&
                        "SimBrief".equals(existingSource)) {
                    return true;
                }
            }
        } catch (Exception e) {
            logger.error("Error checking for duplicate flights", e);
        }
        return false;
    }

    private static String getExistingFlights() {
        if (cachedFlightsJson != null &&
                System.currentTimeMillis() - lastCacheUpdate < CACHE_DURATION_MS) {
            return cachedFlightsJson;
        }

        try {
            cachedFlightsJson = GitHubAPI.getFlightsJSON();
            lastCacheUpdate = System.currentTimeMillis();
            return cachedFlightsJson;
        } catch (Exception e) {
            logger.error("Error reading existing flights", e);
            return "[]";
        }
    }

    private static String generateFlightId() {
        return "CPX" + System.currentTimeMillis() % 10000;
    }

    public static boolean isFlightDuplicate(String flightId, String pilotId) {
        return isDuplicateFlight(flightId, pilotId);
    }
}