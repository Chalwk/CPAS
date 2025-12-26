/* Copyright (c) 2025. Jericho Crosby (Chalwk) */

package com.chalwk.commands.general;

import com.chalwk.commands.CommandManager;
import com.chalwk.config.Constants;
import com.chalwk.data.FlightDataManager;
import net.dv8tion.jda.api.EmbedBuilder;
import net.dv8tion.jda.api.events.interaction.command.SlashCommandInteractionEvent;
import net.dv8tion.jda.api.hooks.ListenerAdapter;
import net.dv8tion.jda.api.interactions.commands.OptionType;
import net.dv8tion.jda.api.interactions.commands.build.Commands;
import net.dv8tion.jda.api.interactions.commands.build.OptionData;
import net.dv8tion.jda.api.interactions.commands.build.SlashCommandData;
import org.jetbrains.annotations.NotNull;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.Map;

public class SpecialMissionCommand extends ListenerAdapter implements CommandManager {

    @Override
    public String getCommandName() {
        return "missionreport";
    }

    @Override
    public SlashCommandData getCommandData() {
        return Commands.slash(getCommandName(), "Submit a special mission report (HEMS, SAR, tours, etc.)")
                .addOptions(
                        new OptionData(OptionType.STRING, "mission_type", "Type of mission", true)
                                .addChoice("Search & Rescue (SAR)", "SAR")
                                .addChoice("Patient Transfer", "PATIENT")
                                .addChoice("Medical Evacuation (MEDEVAC)", "MEDEVAC")
                                .addChoice("Firefighting Support", "FIRE")
                                .addChoice("Law Enforcement", "POLICE")
                                .addChoice("Aerial Survey", "SURVEY")
                                .addChoice("VIP Transport", "VIP")
                                .addChoice("Glacier Tour", "TOUR_GLACIER")
                                .addChoice("Sightseeing Tour", "TOUR_SIGHTSEEING")
                                .addChoice("Training Flight", "TRAINING")
                                .addChoice("Maintenance Flight", "MAINTENANCE")
                                .addChoice("Test Flight", "TEST")
                                .addChoice("Other", "OTHER"),
                        new OptionData(OptionType.STRING, "aircraft", "Aircraft used", true)
                                .addChoice("Airbus H125", "H125")
                                .addChoice("Airbus H145", "H145")
                                .addChoice("Robinson R44", "R44")
                                .addChoice("Robinson R66", "R66")
                                .addChoice("Piper Archer (P28A)", "P28A")
                                .addChoice("Other Helicopter", "HELO_OTHER")
                                .addChoice("Other Fixed Wing", "FIXED_OTHER"),
                        new OptionData(OptionType.STRING, "callsign", "Mission callsign (e.g., RESCUE1, TOUR4)", true),
                        new OptionData(OptionType.STRING, "departure", "Departure location", true),
                        new OptionData(OptionType.STRING, "arrival", "Destination/Incident location", true),
                        new OptionData(OptionType.STRING, "flight_time", "Total flight time (HH:MM)", true)
                                .setMinLength(4).setMaxLength(5),
                        new OptionData(OptionType.STRING, "mission_details", "Brief mission description", false),
                        new OptionData(OptionType.NUMBER, "patients", "Number of patients/rescued persons", false),
                        new OptionData(OptionType.STRING, "weather", "Weather conditions", false),
                        new OptionData(OptionType.STRING, "challenges", "Special challenges encountered", false),
                        new OptionData(OptionType.STRING, "block_time", "Total block time (HH:MM) if different", false)
                                .setMinLength(4).setMaxLength(5),
                        new OptionData(OptionType.STRING, "notes", "Additional notes", false)
                );
    }

    @Override
    public void onSlashCommandInteraction(@NotNull SlashCommandInteractionEvent event) {
        if (!event.getName().equals(getCommandName())) return;
        handleCommand(event);
    }

    @Override
    public void handleCommand(SlashCommandInteractionEvent event) {
        try {
            event.deferReply().queue();

            Map<String, String> missionData = new HashMap<>();

            missionData.put("mission_type", event.getOption("mission_type").getAsString());
            missionData.put("aircraft_icao", event.getOption("aircraft").getAsString());
            missionData.put("callsign", event.getOption("callsign").getAsString().toUpperCase());
            missionData.put("origin", event.getOption("departure").getAsString().toUpperCase());
            missionData.put("destination", event.getOption("arrival").getAsString().toUpperCase());
            missionData.put("flight_time", event.getOption("flight_time").getAsString());

            if (event.getOption("mission_details") != null) {
                missionData.put("mission_details", event.getOption("mission_details").getAsString());
            }

            if (event.getOption("patients") != null) {
                missionData.put("patients", event.getOption("patients").getAsString());
            }

            if (event.getOption("block_time") != null) {
                missionData.put("block_time", event.getOption("block_time").getAsString());
            } else {
                missionData.put("block_time", missionData.get("flight_time"));
            }

            if (event.getOption("weather") != null) {
                missionData.put("weather", event.getOption("weather").getAsString());
            }

            if (event.getOption("challenges") != null) {
                missionData.put("challenges", event.getOption("challenges").getAsString());
            }

            if (event.getOption("notes") != null) {
                missionData.put("notes", event.getOption("notes").getAsString());
            }

            missionData.put("aircraft_name", getAircraftName(missionData.get("aircraft_icao")));
            missionData.put("aircraft_reg", "CPX-" + missionData.get("aircraft_icao"));
            missionData.put("flight_number", missionData.get("callsign"));
            missionData.put("route_text", "Mission: " + getMissionTypeDisplay(missionData.get("mission_type")));
            missionData.put("cruise_alt", "VFR");
            missionData.put("distance", "N/A");
            missionData.put("alternate", "N/A");
            missionData.put("pdf_url", "N/A");
            missionData.put("source", "MissionReport");

            FlightDataManager.saveFlight(
                    event.getUser(),
                    missionData,
                    "MISSION_" + event.getUser().getId().substring(0, 8),
                    "completed"
            );

            EmbedBuilder embed = createMissionReportEmbed(event.getUser(), missionData);
            event.getHook().editOriginalEmbeds(embed.build()).queue();

            sendToMissionChannel(event, missionData);

        } catch (Exception e) {
            event.getHook().editOriginal("❌ An error occurred while submitting your mission report: " + e.getMessage())
                    .queue();
        }
    }

    private EmbedBuilder createMissionReportEmbed(net.dv8tion.jda.api.entities.User user, Map<String, String> missionData) {
        String timestamp = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm"));

        EmbedBuilder embed = new EmbedBuilder()
                .setTitle("🚁 Mission Report - " + missionData.get("callsign"))
                .setColor(getMissionColor(missionData.get("mission_type")))
                .setAuthor(user.getAsTag(), null, user.getEffectiveAvatarUrl())
                .setFooter("Mission ID: CPX" + System.currentTimeMillis() % 10000 + " • " + timestamp);

        embed.addField("Mission Type", getMissionTypeDisplay(missionData.get("mission_type")), true);
        embed.addField("Aircraft", missionData.get("aircraft_name"), true);
        embed.addField("Route", missionData.get("origin") + " → " + missionData.get("destination"), false);
        embed.addField("Flight Time", missionData.get("flight_time"), true);

        if (missionData.containsKey("block_time") && !missionData.get("block_time").equals(missionData.get("flight_time"))) {
            embed.addField("Block Time", missionData.get("block_time"), true);
        }

        if (missionData.containsKey("patients")) {
            embed.addField("Patients/Rescued", missionData.get("patients"), true);
        }

        if (missionData.containsKey("mission_details")) {
            String details = missionData.get("mission_details");
            if (details.length() > 1024) details = details.substring(0, 1020) + "...";
            embed.addField("Mission Details", details, false);
        }

        if (missionData.containsKey("weather")) {
            embed.addField("Weather", missionData.get("weather"), true);
        }

        if (missionData.containsKey("challenges")) {
            embed.addField("Challenges", missionData.get("challenges"), true);
        }

        embed.setDescription("✅ Mission report submitted successfully!");

        return embed;
    }

    private void sendToMissionChannel(SlashCommandInteractionEvent event, Map<String, String> missionData) {
        try {
            if (Constants.CHANNEL_PIREP != 0) {
                var channel = event.getGuild().getTextChannelById(Constants.CHANNEL_PIREP);
                if (channel != null) {
                    EmbedBuilder channelEmbed = new EmbedBuilder()
                            .setTitle("🚁 New Mission Report")
                            .setColor(getMissionColor(missionData.get("mission_type")))
                            .addField("Pilot", event.getUser().getAsTag(), true)
                            .addField("Mission", getMissionTypeDisplay(missionData.get("mission_type")), true)
                            .addField("Aircraft", missionData.get("aircraft_name"), true)
                            .addField("Route", missionData.get("origin") + " → " + missionData.get("destination"), false)
                            .addField("Flight Time", missionData.get("flight_time"), true)
                            .setTimestamp(LocalDateTime.now());

                    if (missionData.containsKey("mission_details")) {
                        channelEmbed.addField("Details", missionData.get("mission_details"), false);
                    }

                    channel.sendMessageEmbeds(channelEmbed.build()).queue();
                }
            }
        } catch (Exception e) {
            // Silently fail - mission channel posting is optional
        }
    }

    private int getMissionColor(String missionType) {
        return switch (missionType) {
            case "SAR", "MEDEVAC" -> 0xDC2626; // Red for emergencies
            case "PATIENT", "FIRE" -> 0xF59E0B; // Orange for urgent
            case "TOUR_GLACIER", "TOUR_SIGHTSEEING" -> 0x059669; // Green for tours
            case "TRAINING", "TEST" -> 0x3B82F6; // Blue for training
            case "POLICE", "SURVEY" -> 0x8B5CF6; // Purple for special ops
            default -> 0x6B7280; // Gray for others
        };
    }

    private String getMissionTypeDisplay(String type) {
        return switch (type) {
            case "SAR" -> "Search & Rescue";
            case "PATIENT" -> "Patient Transfer";
            case "MEDEVAC" -> "Medical Evacuation";
            case "FIRE" -> "Firefighting Support";
            case "POLICE" -> "Law Enforcement";
            case "SURVEY" -> "Aerial Survey";
            case "VIP" -> "VIP Transport";
            case "TOUR_GLACIER" -> "Glacier Tour";
            case "TOUR_SIGHTSEEING" -> "Sightseeing Tour";
            case "TRAINING" -> "Training Flight";
            case "MAINTENANCE" -> "Maintenance Flight";
            case "TEST" -> "Test Flight";
            case "OTHER" -> "Special Mission";
            default -> type.replace("_", " ");
        };
    }

    private String getAircraftName(String icao) {
        return switch (icao) {
            case "H125" -> "Airbus H125";
            case "H145" -> "Airbus H145";
            case "R44" -> "Robinson R44";
            case "R66" -> "Robinson R66";
            case "P28A" -> "Piper Archer";
            case "HELO_OTHER" -> "Helicopter (Other)";
            case "FIXED_OTHER" -> "Fixed Wing (Other)";
            default -> "Aircraft";
        };
    }
}