/* Copyright (c) 2025. Jericho Crosby (Chalwk) */

package com.chalwk.commands.general;

import com.chalwk.commands.CommandManager;
import com.chalwk.config.Constants;
import com.chalwk.utils.PermissionChecker;
import net.dv8tion.jda.api.EmbedBuilder;
import net.dv8tion.jda.api.entities.MessageEmbed;
import net.dv8tion.jda.api.events.interaction.command.SlashCommandInteractionEvent;
import net.dv8tion.jda.api.hooks.ListenerAdapter;
import net.dv8tion.jda.api.interactions.commands.OptionMapping;
import net.dv8tion.jda.api.interactions.commands.OptionType;
import net.dv8tion.jda.api.interactions.commands.build.Commands;
import net.dv8tion.jda.api.interactions.commands.build.OptionData;
import net.dv8tion.jda.api.interactions.commands.build.SlashCommandData;
import org.jetbrains.annotations.NotNull;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;

public class PirepCommand extends ListenerAdapter implements CommandManager {
    private static final Logger logger = LoggerFactory.getLogger(PirepCommand.class);

    private static final List<String> FLEET_OPTIONS = List.of(
            "R44", "R66", "H125", "H145",
            "Piper Tomahawk", "Piper Warrior II", "Piper Archer II",
            "Piper Arrow III", "Piper Arrow III Turbo", "Piper Arrow IV Turbo"
    );

    private static List<net.dv8tion.jda.api.interactions.commands.Command.Choice> createAircraftChoices() {
        return FLEET_OPTIONS.stream()
                .map(aircraft -> new net.dv8tion.jda.api.interactions.commands.Command.Choice(aircraft, aircraft))
                .toList();
    }

    @Override
    public String getCommandName() {
        return "pirep";
    }

    @Override
    public SlashCommandData getCommandData() {
        return Commands.slash(getCommandName(), "Submit a pilot report")
                .addOptions(
                        new OptionData(OptionType.STRING, "flight_number", "Flight number (e.g., CP123)", true)
                                .setMaxLength(10),
                        new OptionData(OptionType.STRING, "aircraft", "Aircraft type", true)
                                .addChoices(createAircraftChoices()),
                        new OptionData(OptionType.STRING, "origin", "Origin airport (ICAO code)", true)
                                .setMaxLength(4),
                        new OptionData(OptionType.STRING, "destination", "Destination airport (ICAO code)", true)
                                .setMaxLength(4),
                        new OptionData(OptionType.STRING, "flight_time", "Flight time (e.g., 1:45, 2:30)", true)
                                .setMaxLength(10),
                        new OptionData(OptionType.STRING, "route", "Route flown (airways, waypoints)", false)
                                .setMaxLength(100),
                        new OptionData(OptionType.STRING, "remarks", "Additional remarks", false)
                                .setMaxLength(500)
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
            if (isPendingUser(event.getMember())) {
                event.reply("❌ You must be accepted as a pilot before submitting PIREPs!")
                        .setEphemeral(true)
                        .queue();
                return;
            }

            if (!hasAccessToPirep(event.getMember())) {
                event.reply("❌ You don't have permission to submit PIREPs. You need to be accepted as a pilot first!")
                        .setEphemeral(true)
                        .queue();
                return;
            }

            String flightNumber = getOption(event, "flight_number", "");
            String aircraft = getOption(event, "aircraft", "");
            String origin = getOption(event, "origin", "").toUpperCase();
            String destination = getOption(event, "destination", "").toUpperCase();
            String flightTime = getOption(event, "flight_time", "");
            String route = getOption(event, "route", "DCT");
            String remarks = getOption(event, "remarks", "No remarks");

            if (flightNumber.isEmpty() || aircraft.isEmpty() || origin.isEmpty() ||
                    destination.isEmpty() || flightTime.isEmpty()) {
                event.reply("❌ Please fill in all required fields!")
                        .setEphemeral(true)
                        .queue();
                return;
            }

            MessageEmbed pirepEmbed = createPirepEmbed(
                    event.getUser(),
                    flightNumber,
                    aircraft,
                    origin,
                    destination,
                    flightTime,
                    route,
                    remarks
            );

            if (Constants.CHANNEL_PIREP != 0) {
                event.getGuild().getTextChannelById(Constants.CHANNEL_PIREP)
                        .sendMessageEmbeds(pirepEmbed)
                        .queue(
                                success -> {
                                    event.reply("✅ PIREP submitted successfully!")
                                            .setEphemeral(true)
                                            .queue();
                                    logger.info("PIREP submitted by {}: {} -> {} in {}",
                                            event.getUser().getAsTag(),
                                            origin,
                                            destination,
                                            aircraft);
                                },
                                error -> {
                                    event.reply("❌ Failed to submit PIREP. Please try again.")
                                            .setEphemeral(true)
                                            .queue();
                                    logger.error("Failed to send PIREP", error);
                                }
                        );
            } else {
                event.reply("❌ PIREP channel not configured. Please contact an administrator.")
                        .setEphemeral(true)
                        .queue();
            }

        } catch (Exception e) {
            event.reply("❌ An error occurred while processing your PIREP.")
                    .setEphemeral(true)
                    .queue();
            logger.error("Error in PIREP command", e);
        }
    }

    private boolean isPendingUser(net.dv8tion.jda.api.entities.Member member) {
        if (member == null) return false;
        return member.getRoles().stream()
                .anyMatch(role -> role.getIdLong() == Constants.ROLE_PENDING);
    }

    private boolean hasAccessToPirep(net.dv8tion.jda.api.entities.Member member) {
        if (member == null) return false;

        if (PermissionChecker.isAdmin(member)) {
            return true;
        }

        boolean hasAcceptedRole = member.getRoles().stream()
                .anyMatch(role -> role.getIdLong() == Constants.ROLE_ACCEPTED);

        boolean hasPilotRole = member.getRoles().stream()
                .anyMatch(role ->
                        role.getIdLong() == Constants.ROLE_PILOT_UNDER_TRAINING ||
                                role.getIdLong() == Constants.ROLE_CHARTER_PILOT ||
                                role.getIdLong() == Constants.ROLE_SENIOR_CHARTER_PILOT ||
                                role.getIdLong() == Constants.ROLE_LEAD_PILOT ||
                                role.getIdLong() == Constants.ROLE_INSTRUCTOR
                );

        return hasAcceptedRole || hasPilotRole;
    }

    private String getOption(SlashCommandInteractionEvent event, String optionName, String defaultValue) {
        OptionMapping option = event.getOption(optionName);
        return option != null ? option.getAsString() : defaultValue;
    }

    private MessageEmbed createPirepEmbed(net.dv8tion.jda.api.entities.User user,
                                          String flightNumber,
                                          String aircraft,
                                          String origin,
                                          String destination,
                                          String flightTime,
                                          String route,
                                          String remarks) {

        String timestamp = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm"));

        return new EmbedBuilder()
                .setTitle("📋 Pilot Report - " + flightNumber)
                .setColor(0x2D6BC9)
                .setAuthor(user.getAsTag(), null, user.getEffectiveAvatarUrl())
                .addField("✈️ Aircraft", aircraft, true)
                .addField("📍 Route", String.format("%s → %s", origin, destination), true)
                .addField("⏱️ Flight Time", flightTime, true)
                .addField("🛣️ Route Details", route, false)
                .addField("📝 Remarks", remarks, false)
                .setFooter("Submitted at " + timestamp + " | Coastal Peaks Air Service")
                .setThumbnail("https://cdn.discordapp.com/emojis/✈️.png")
                .build();
    }
}