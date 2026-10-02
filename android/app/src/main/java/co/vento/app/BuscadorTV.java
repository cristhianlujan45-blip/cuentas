package co.vento.app;

import android.content.Context;
import android.net.wifi.WifiManager;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.SocketTimeoutException;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Busca los TV del wifi igual que la app de YouTube: manda por la red local el mensaje estándar
 * «¿quién recibe aplicaciones?» (SSDP / DIAL) y cada TV que tenga YouTube responde con su
 * dirección. Así salen los Smart TV (LG webOS, Samsung), los TV Box, Android TV / Google TV,
 * Fire TV y los Chromecast, todos en una sola lista.
 *
 * DIAL es el protocolo público que usan los celulares para abrir YouTube en un TV
 * (http://www.dial-multiscreen.org). Un navegador no deja usarlo; una app instalada sí.
 */
final class BuscadorTV {

    interface Oyente {
        void encontrado(JSONObject tv);
        void terminado(int cuantos);
    }

    private static final String ST_DIAL = "urn:dial-multiscreen-org:service:dial:1";
    private static final String GRUPO = "239.255.255.250";
    private static final int PUERTO = 1900;

    private final Context ctx;

    BuscadorTV(Context ctx) { this.ctx = ctx == null ? null : ctx.getApplicationContext(); }

    /** Busca durante unos segundos. Llama a {@code oyente} por cada TV nuevo (desde otro hilo). */
    void buscar(final Oyente oyente) {
        new Thread(() -> {
            final Set<String> vistos = new HashSet<>();
            final int[] total = {0};
            WifiManager wifi = ctx == null ? null : (WifiManager) ctx.getSystemService(Context.WIFI_SERVICE);
            WifiManager.MulticastLock candado = null;
            try {
                if (wifi != null) {
                    candado = wifi.createMulticastLock("vento-tv");
                    candado.setReferenceCounted(false);
                    candado.acquire();
                }
            } catch (Exception ignorado) { candado = null; }
            try (DatagramSocket sock = new DatagramSocket()) {
                sock.setSoTimeout(500);
                sock.setBroadcast(true);
                InetAddress grupo = InetAddress.getByName(GRUPO);
                String[] busquedas = {ST_DIAL, "urn:dial-multiscreen-org:device:dial:1"};
                long fin = System.currentTimeMillis() + 5500;
                long proximoEnvio = 0;
                int envios = 0;
                byte[] buf = new byte[4096];
                while (System.currentTimeMillis() < fin) {
                    if (envios < 3 && System.currentTimeMillis() >= proximoEnvio) {
                        for (String st : busquedas) {
                            String msg = "M-SEARCH * HTTP/1.1\r\n" +
                                    "HOST: " + GRUPO + ":" + PUERTO + "\r\n" +
                                    "MAN: \"ssdp:discover\"\r\n" +
                                    "MX: 2\r\n" +
                                    "ST: " + st + "\r\n" +
                                    "USER-AGENT: Android UPnP/1.1 Vento/1\r\n\r\n";
                            byte[] b = msg.getBytes(StandardCharsets.US_ASCII);
                            try { sock.send(new DatagramPacket(b, b.length, grupo, PUERTO)); } catch (Exception ignorado) { }
                        }
                        envios++;
                        proximoEnvio = System.currentTimeMillis() + 1200;
                    }
                    try {
                        DatagramPacket p = new DatagramPacket(buf, buf.length);
                        sock.receive(p);
                        String resp = new String(p.getData(), 0, p.getLength(), StandardCharsets.UTF_8);
                        final String ubicacion = cabecera(resp, "LOCATION");
                        if (ubicacion == null || !vistos.add(ubicacion)) continue;
                        final String usn = cabecera(resp, "USN");
                        new Thread(() -> {
                            JSONObject tv = describir(ubicacion, usn);
                            if (tv != null) { synchronized (total) { total[0]++; } oyente.encontrado(tv); }
                        }).start();
                    } catch (SocketTimeoutException t) {
                        // seguir esperando respuestas
                    }
                }
                Thread.sleep(2500);   // que alcancen a llegar las descripciones de los últimos
            } catch (Exception e) {
                // sin wifi o red que no deja: se avisa abajo con 0
            } finally {
                try { if (candado != null) candado.release(); } catch (Exception ignorado) { }
            }
            oyente.terminado(total[0]);
        }).start();
    }

    private static String cabecera(String resp, String nombre) {
        for (String linea : resp.split("\r?\n")) {
            int i = linea.indexOf(':');
            if (i > 0 && linea.substring(0, i).trim().equalsIgnoreCase(nombre)) return linea.substring(i + 1).trim();
        }
        return null;
    }

    private static String etiqueta(String xml, String tag) {
        Matcher m = Pattern.compile("<" + tag + "[^>]*>([^<]*)</" + tag + ">", Pattern.CASE_INSENSITIVE).matcher(xml);
        return m.find() ? m.group(1).trim() : "";
    }

    /** Pide la descripción del TV: su nombre y la dirección donde se abren aplicaciones (YouTube). */
    private static JSONObject describir(String ubicacion, String usn) {
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(ubicacion).openConnection();
            c.setConnectTimeout(2500);
            c.setReadTimeout(2500);
            c.setRequestProperty("User-Agent", "Android Vento/1");
            String appUrl = c.getHeaderField("Application-URL");
            if (appUrl == null) appUrl = c.getHeaderField("Application-Url");
            String xml = leer(c.getInputStream());
            if (appUrl == null || appUrl.isEmpty()) return null;            // no abre aplicaciones: no sirve para YouTube
            if (!appUrl.endsWith("/")) appUrl = appUrl + "/";
            String nombre = etiqueta(xml, "friendlyName");
            String fabricante = etiqueta(xml, "manufacturer");
            String modelo = etiqueta(xml, "modelName");
            URL u = new URL(ubicacion);
            // ¿Tiene YouTube? (404 = no lo tiene instalado)
            int yt = estado(appUrl + "YouTube");
            if (yt == 404) return null;
            JSONObject tv = new JSONObject();
            tv.put("id", usn != null ? usn : ubicacion);
            tv.put("nombre", nombre.isEmpty() ? (modelo.isEmpty() ? u.getHost() : modelo) : nombre);
            tv.put("fabricante", fabricante);
            tv.put("modelo", modelo);
            tv.put("ip", u.getHost());
            tv.put("appUrl", appUrl);
            tv.put("tipo", tipo(fabricante + " " + modelo + " " + nombre));
            return tv;
        } catch (Exception e) {
            return null;
        } finally {
            if (c != null) c.disconnect();
        }
    }

    private static String tipo(String t) {
        String s = t.toLowerCase(Locale.ROOT);
        if (s.contains("chromecast") || s.contains("google")) return "chromecast";
        if (s.contains("fire") || s.contains("amazon")) return "firetv";
        if (s.contains("lg") || s.contains("webos")) return "lg";
        if (s.contains("samsung") || s.contains("tizen")) return "samsung";
        if (s.contains("roku")) return "roku";
        if (s.contains("box") || s.contains("android")) return "tvbox";
        return "tv";
    }

    private static int estado(String url) {
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(url).openConnection();
            c.setConnectTimeout(2000);
            c.setReadTimeout(2000);
            return c.getResponseCode();
        } catch (Exception e) {
            return -1;
        } finally {
            if (c != null) c.disconnect();
        }
    }

    /**
     * Abre YouTube en el TV con un código de vinculación (DIAL «pairingCode»): el TV abre YouTube y
     * registra ese código; con él Vento obtiene el permiso para mandarle la cola (como «Vincular con
     * código de TV», pero sin escribir nada). Devuelve el código HTTP del TV (201/200 = abrió).
     */
    static int abrirYouTube(String appUrl, String codigo) {
        HttpURLConnection c = null;
        try {
            byte[] cuerpo = ("pairingCode=" + codigo + "&theme=cl").getBytes(StandardCharsets.UTF_8);
            c = (HttpURLConnection) new URL(appUrl + "YouTube").openConnection();
            c.setConnectTimeout(4000);
            c.setReadTimeout(6000);
            c.setRequestMethod("POST");
            c.setDoOutput(true);
            c.setRequestProperty("Content-Type", "text/plain; charset=\"utf-8\"");
            c.setFixedLengthStreamingMode(cuerpo.length);
            try (OutputStream o = c.getOutputStream()) { o.write(cuerpo); }
            return c.getResponseCode();
        } catch (Exception e) {
            return -1;
        } finally {
            if (c != null) c.disconnect();
        }
    }

    private static String leer(InputStream in) throws java.io.IOException {
        try (InputStream i = in; ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] b = new byte[8192];
            int n;
            while ((n = i.read(b)) > 0 && out.size() < 200_000) out.write(b, 0, n);
            return out.toString("UTF-8");
        }
    }
}
