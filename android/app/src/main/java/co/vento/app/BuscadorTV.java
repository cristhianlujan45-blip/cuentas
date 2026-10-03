package co.vento.app;

import android.content.Context;
import android.net.nsd.NsdManager;
import android.net.nsd.NsdServiceInfo;
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
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
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
            final Set<String> ips = new HashSet<>();
            final int[] total = {0};
            final java.util.function.Consumer<JSONObject> emitir = tv -> {
                String ip = tv.optString("ip");
                synchronized (ips) { if (!ip.isEmpty() && !ips.add(ip)) return; total[0]++; }
                oyente.encontrado(tv);
            };
            // Chromecast, Google TV, Android TV y TV Box con Chromecast se anuncian por mDNS: se buscan a la vez.
            final long hasta = System.currentTimeMillis() + 7000;
            final Runnable pararCast = buscarCast(emitir, hasta);
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
                            if (tv != null) emitir.accept(tv);
                        }).start();
                    } catch (SocketTimeoutException t) {
                        // seguir esperando respuestas
                    }
                }
                long falta = hasta + 1500 - System.currentTimeMillis();
                if (falta > 0) Thread.sleep(falta);   // que alcancen a llegar los Chromecast y las descripciones de los últimos
            } catch (Exception e) {
                // sin wifi o red que no deja: se avisa abajo con 0
            } finally {
                try { if (candado != null) candado.release(); } catch (Exception ignorado) { }
                try { pararCast.run(); } catch (Exception ignorado) { }
            }
            oyente.terminado(total[0]);
        }).start();
    }

    /**
     * Busca por mDNS los aparatos con Chromecast integrado (_googlecast._tcp) y los Android TV
     * (_androidtvremote2._tcp). A cada uno se le abre YouTube por su servidor DIAL (puerto 8008),
     * igual que hace la app de YouTube. Si un aparato no deja abrirlo así, sale igual en la lista
     * (con la nota de usar el código del TV). Devuelve con qué se detiene la búsqueda.
     */
    private Runnable buscarCast(final java.util.function.Consumer<JSONObject> emitir, final long hasta) {
        if (ctx == null) return () -> { };
        final NsdManager nsd = (NsdManager) ctx.getSystemService(Context.NSD_SERVICE);
        if (nsd == null) return () -> { };
        final LinkedBlockingQueue<NsdServiceInfo> cola = new LinkedBlockingQueue<>();
        final String[] tipos = {"_googlecast._tcp", "_androidtvremote2._tcp"};
        final NsdManager.DiscoveryListener[] oyentes = new NsdManager.DiscoveryListener[tipos.length];
        for (int i = 0; i < tipos.length; i++) {
            oyentes[i] = new NsdManager.DiscoveryListener() {
                @Override public void onStartDiscoveryFailed(String t, int e) { }
                @Override public void onStopDiscoveryFailed(String t, int e) { }
                @Override public void onDiscoveryStarted(String t) { }
                @Override public void onDiscoveryStopped(String t) { }
                @Override public void onServiceFound(NsdServiceInfo s) { cola.offer(s); }
                @Override public void onServiceLost(NsdServiceInfo s) { }
            };
            try { nsd.discoverServices(tipos[i], NsdManager.PROTOCOL_DNS_SD, oyentes[i]); } catch (Exception e) { oyentes[i] = null; }
        }
        // Android solo resuelve uno a la vez: se resuelven en fila.
        new Thread(() -> {
            final Set<String> hechos = new HashSet<>();
            while (System.currentTimeMillis() < hasta) {
                NsdServiceInfo s;
                try { s = cola.poll(300, TimeUnit.MILLISECONDS); } catch (InterruptedException e) { break; }
                if (s == null || !hechos.add(s.getServiceName())) continue;
                final CountDownLatch listo = new CountDownLatch(1);
                final NsdServiceInfo[] r = {null};
                try {
                    nsd.resolveService(s, new NsdManager.ResolveListener() {
                        @Override public void onResolveFailed(NsdServiceInfo x, int e) { listo.countDown(); }
                        @Override public void onServiceResolved(NsdServiceInfo x) { r[0] = x; listo.countDown(); }
                    });
                    listo.await(3, TimeUnit.SECONDS);
                } catch (Exception ignorado) { }
                if (r[0] == null || r[0].getHost() == null) continue;
                final NsdServiceInfo x = r[0];
                new Thread(() -> { JSONObject tv = describirCast(x); if (tv != null) emitir.accept(tv); }).start();
            }
        }).start();
        return () -> { for (NsdManager.DiscoveryListener o : oyentes) if (o != null) try { nsd.stopServiceDiscovery(o); } catch (Exception ignorado) { } };
    }

    private static String atributo(NsdServiceInfo x, String k) {
        try {
            Map<String, byte[]> a = x.getAttributes();
            byte[] v = a == null ? null : a.get(k);
            return v == null ? "" : new String(v, StandardCharsets.UTF_8).trim();
        } catch (Exception e) { return ""; }
    }

    @SuppressWarnings("deprecation")
    private static JSONObject describirCast(NsdServiceInfo x) {
        try {
            String ip = x.getHost().getHostAddress();
            if (ip == null || ip.contains(":")) return null;               // solo IPv4 del wifi
            String nombre = atributo(x, "fn"), modelo = atributo(x, "md");
            boolean esCast = x.getServiceType() != null && x.getServiceType().contains("googlecast");
            if (nombre.isEmpty()) nombre = x.getServiceName().replaceAll("-[0-9a-f]{20,}$", "").replace('-', ' ');
            String appUrl = "http://" + ip + ":8008/apps/";
            int yt = estado(appUrl + "YouTube");
            JSONObject tv = new JSONObject();
            tv.put("id", "mdns:" + ip);
            tv.put("nombre", nombre);
            tv.put("fabricante", esCast ? "Chromecast integrado" : "Android TV");
            tv.put("modelo", modelo);
            tv.put("ip", ip);
            String t = (modelo + " " + nombre).toLowerCase(Locale.ROOT);
            tv.put("tipo", t.contains("chromecast") || t.contains("google tv") ? "chromecast" : (esCast && !t.contains("tv") ? "chromecast" : "androidtv"));
            if (yt >= 200 && yt < 300) tv.put("appUrl", appUrl);
            else tv.put("soloCodigo", true);                               // sale en la lista, pero se conecta con el código del TV
            return tv;
        } catch (Exception e) {
            return null;
        }
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
