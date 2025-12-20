/* Copyright (c) 2025. Jericho Crosby (Chalwk) */

package com.chalwk.utils;

import net.dv8tion.jda.api.EmbedBuilder;
import net.dv8tion.jda.api.entities.MessageEmbed;

public class EmbedUtils {

    public static void sendPrivateMessage(net.dv8tion.jda.api.entities.channel.concrete.PrivateChannel channel,
                                          String title, String message) {
        channel.sendMessageEmbeds(new EmbedBuilder()
                .setTitle(title)
                .setDescription(message)
                .setColor(0x2D6BC9)
                .build()).queue();
    }

    public static MessageEmbed createWelcomeEmbed(String title, String description, int color) {
        return new EmbedBuilder()
                .setTitle(title)
                .setDescription(description)
                .setColor(color)
                .setFooter("Coastal Peaks Air Service", null)
                .setTimestamp(java.time.Instant.now())
                .build();
    }

    public static MessageEmbed createLogEmbed(String title, String description, int color) {
        return new EmbedBuilder()
                .setTitle(title)
                .setDescription(description)
                .setColor(color)
                .setTimestamp(java.time.Instant.now())
                .build();
    }
}