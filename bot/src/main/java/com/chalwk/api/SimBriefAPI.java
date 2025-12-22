/* Copyright (c) 2025. Jericho Crosby (Chalwk) */

package com.chalwk.api;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;

import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.HashMap;
import java.util.Map;

public class SimBriefAPI {
    private static final Logger logger = LoggerFactory.getLogger(SimBriefAPI.class);

    private static final HttpClient client = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build();
    private static final String BASE_URL = "https://www.simbrief.com/api/xml.fetcher.php";

    public static Document fetchFlightPlanByUserId(String userId) throws Exception {
        String url = BASE_URL + "?userid=" + userId;
        return fetchFromSimBrief(url);
    }

    private static Document fetchFromSimBrief(String url) throws Exception {
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .header("Accept", "application/xml")
                .header("User-Agent", "CPAS-Discord-Bot/1.0")
                .GET()
                .build();

        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());

        if (response.statusCode() != 200) {
            throw new Exception("SimBrief API error: " + response.statusCode() + " - " + response.body());
        }

        DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
        DocumentBuilder builder = factory.newDocumentBuilder();
        return builder.parse(new java.io.ByteArrayInputStream(response.body().getBytes()));
    }

    public static Map<String, String> parseFlightPlan(Document doc) {
        Map<String, String> flightPlan = new HashMap<>();

        try {
            NodeList fetchList = doc.getElementsByTagName("fetch");
            if (fetchList.getLength() > 0) {
                Element fetch = (Element) fetchList.item(0);
                String status = getElementText(fetch, "status");
                if ("ERROR".equals(status)) {
                    String errorMsg = getElementText(fetch, "error_message");
                    flightPlan.put("error", errorMsg != null ? errorMsg : "Unknown error");
                    return flightPlan;
                }
            }

            flightPlan.put("flight_number", getElementText(doc, "icao_airline") + getElementText(doc, "flight_number"));
            flightPlan.put("callsign", getElementText(doc, "callsign"));

            flightPlan.put("aircraft_icao", getElementText(doc, "icaocode"));
            flightPlan.put("aircraft_name", getElementText(doc, "name"));
            flightPlan.put("aircraft_reg", getElementText(doc, "reg"));

            flightPlan.put("origin", getElementTextFromParent(doc, "origin"));
            flightPlan.put("destination", getElementTextFromParent(doc, "destination"));
            flightPlan.put("alternate", getElementTextFromParent(doc, "alternate"));

            String estEnroute = getElementText(doc, "est_time_enroute");
            if (estEnroute != null && !estEnroute.isEmpty()) {
                flightPlan.put("flight_time", formatFlightTime(Integer.parseInt(estEnroute)));
            }

            String estBlock = getElementText(doc, "est_block");
            if (estBlock != null && !estBlock.isEmpty()) {
                flightPlan.put("block_time", formatFlightTime(Integer.parseInt(estBlock)));
            }

            flightPlan.put("departure_time", getElementText(doc, "sched_out"));
            flightPlan.put("arrival_time", getElementText(doc, "sched_in"));

            flightPlan.put("route_text", getElementText(doc, "route"));
            flightPlan.put("cruise_alt", getElementText(doc, "initial_altitude"));
            flightPlan.put("cruise_temp", getElementText(doc, "avg_temp_dev"));
            flightPlan.put("wind_component", getElementText(doc, "avg_wind_comp"));

            String planBurn = getElementText(doc, "enroute_burn");
            if (planBurn != null && !planBurn.isEmpty()) {
                flightPlan.put("fuel_burn", String.format("%.1f", Double.parseDouble(planBurn)));
            }

            String planRamp = getElementText(doc, "plan_ramp");
            if (planRamp != null && !planRamp.isEmpty()) {
                flightPlan.put("fuel_total", String.format("%.1f", Double.parseDouble(planRamp)));
            }

            String estZfw = getElementText(doc, "est_zfw");
            if (estZfw != null && !estZfw.isEmpty()) {
                flightPlan.put("zfw", String.format("%.1f", Double.parseDouble(estZfw)));
            }

            String estTow = getElementText(doc, "est_tow");
            if (estTow != null && !estTow.isEmpty()) {
                flightPlan.put("tow", String.format("%.1f", Double.parseDouble(estTow)));
            }

            NodeList filesList = doc.getElementsByTagName("files");
            if (filesList.getLength() > 0) {
                Element files = (Element) filesList.item(0);

                NodeList directoryList = files.getElementsByTagName("directory");
                if (directoryList.getLength() > 0 && directoryList.item(0).getFirstChild() != null) {
                    String directory = directoryList.item(0).getFirstChild().getNodeValue();

                    NodeList pdfList = files.getElementsByTagName("pdf");
                    if (pdfList.getLength() > 0) {
                        Element pdf = (Element) pdfList.item(0);
                        NodeList linkList = pdf.getElementsByTagName("link");
                        if (linkList.getLength() > 0 && linkList.item(0).getFirstChild() != null) {
                            String pdfLink = linkList.item(0).getFirstChild().getNodeValue();

                            if (directory != null && pdfLink != null) {
                                if (!directory.endsWith("/")) {
                                    directory = directory + "/";
                                }
                                flightPlan.put("pdf_url", directory + pdfLink);
                            }
                        }
                    }
                }
            }

        } catch (Exception e) {
            logger.error("Error parsing SimBrief flight plan", e);
            flightPlan.put("error", "Failed to parse flight plan data: " + e.getMessage());
        }

        return flightPlan;
    }

    private static String getElementText(Document doc, String tagName) {
        NodeList nodeList = doc.getElementsByTagName(tagName);
        if (nodeList.getLength() > 0 && nodeList.item(0).getFirstChild() != null) {
            return nodeList.item(0).getFirstChild().getNodeValue();
        }
        return null;
    }

    private static String getElementText(Element parent, String tagName) {
        NodeList nodeList = parent.getElementsByTagName(tagName);
        if (nodeList.getLength() > 0 && nodeList.item(0).getFirstChild() != null) {
            return nodeList.item(0).getFirstChild().getNodeValue();
        }
        return null;
    }

    private static String getElementTextFromParent(Document doc, String parentTagName) {
        NodeList parentList = doc.getElementsByTagName(parentTagName);
        if (parentList.getLength() > 0) {
            Element parent = (Element) parentList.item(0);
            NodeList childList = parent.getElementsByTagName("icao_code");
            if (childList.getLength() > 0 && childList.item(0).getFirstChild() != null) {
                return childList.item(0).getFirstChild().getNodeValue();
            }
        }
        return null;
    }

    private static String formatFlightTime(int minutes) {
        int hours = minutes / 60;
        int mins = minutes % 60;
        return String.format("%d:%02d", hours, mins);
    }
}