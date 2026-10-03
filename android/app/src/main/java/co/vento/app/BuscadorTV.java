package co.vento.app;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.LinkAddress;
import android.net.LinkProperties;
import android.net.Network;
import android.net.NetworkCapabilities;
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
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.NetworkInterface;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
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

    // Una sola búsqueda a la vez: si se pide otra mientras busca (abrir Música y tocar «Transmitir al TV»),
    // se une a la que va en curso y recibe los mismos TV. Antes eran dos búsquedas a la vez que se pisaban
    // (Android resuelve los Chromecast de a uno) y la lista se quedaba con uno solo o vacía.
    private static final Object CANDADO = new Object();
    private static boolean enCurso = false;
    private static final List<Oyente> oyentes = new ArrayList<>();
    private static final Map<String, JSONObject> hallados = new LinkedHashMap<>();
    /** Red wifi del celular: la búsqueda y las llamadas al TV van SIEMPRE por ahí (no por datos ni VPN). */
    static volatile Network redWifi = null;
    /** Informe de la última búsqueda (qué encontró cada método): sirve para saber por qué no sale un TV. */
    private static final JSONObject diag = new JSONObject();
    static void anotar(String k, Object v) { synchronized (diag) { try { diag.put(k, v); } catch (Exception ignorado) { } } }
    static void sumar(String k) { synchronized (diag) { try { diag.put(k, diag.optInt(k, 0) + 1); } catch (Exception ignorado) { } } }
    static void agregar(String k, String v) { synchronized (diag) { try { String a = diag.optString(k, ""); if (a.length() < 600) diag.put(k, a.isEmpty() ? v : a + ", " + v); } catch (Exception ignorado) { } } }
    static String diagnostico() { synchronized (diag) { return diag.toString(); } }

    /** Busca durante unos segundos. Llama a {@code oyente} por cada TV nuevo (desde otro hilo). */
    void buscar(final Oyente oyente) {
        synchronized (CANDADO) {
            if (enCurso) {
                oyentes.add(oyente);
                final List<JSONObject> ya = new ArrayList<>(hallados.values());
                new Thread(() -> { for (JSONObject tv : ya) oyente.encontrado(tv); }).start();
                return;
            }
            enCurso = true;
            oyentes.clear();
            oyentes.add(oyente);
            hallados.clear();
        }
        new Thread(this::buscarAhora).start();
    }

    private static void emitir(JSONObject tv) {
        if (tv == null) return;
        String ip = tv.optString("ip");
        List<Oyente> a;
        synchronized (CANDADO) {
            if (ip.isEmpty() || hallados.containsKey(ip)) return;
            hallados.put(ip, tv);
            a = new ArrayList<>(oyentes);
        }
        agregar("vistos", tv.optString("nombre") + " (" + ip + ")");
        for (Oyente o : a) try { o.encontrado(tv); } catch (Exception ignorado) { }
    }

    static void emitirExterno(JSONObject tv) { emitir(tv); }

    /** Un aparato con Chromecast integrado ya identificado (nombre como lo muestra YouTube): se le mira YouTube por DIAL. */
    static JSONObject describirCastIp(String ip, String nombre, String modelo, String muestra) {
        try {
            String appUrl = "http://" + ip + ":8008/apps/";
            String[] ytr = estadoYouTube(appUrl + "YouTube");
            int yt = Integer.parseInt(ytr[0]);
            JSONObject tv = new JSONObject();
            tv.put("nombre", nombre == null || nombre.isEmpty() ? "Chromecast" : nombre);
            tv.put("fabricante", "Chromecast integrado");
            tv.put("modelo", modelo == null ? "" : modelo);
            tv.put("ip", ip);
            String t = ((modelo == null ? "" : modelo) + " " + nombre).toLowerCase(Locale.ROOT);
            tv.put("tipo", t.contains("tv") && !t.contains("chromecast") ? "androidtv" : "chromecast");
            if (yt >= 200 && yt < 300) tv.put("appUrl", appUrl); else tv.put("soloCodigo", true);
            if (muestra != null && !muestra.isEmpty()) tv.put("app", muestra);
            marcarYouTube(tv, ytr, muestra == null ? "" : muestra);
            return tv;
        } catch (Exception e) { return null; }
    }

    private static boolean yaEsta(String ip) { synchronized (CANDADO) { return hallados.containsKey(ip); } }

    private void buscarAhora() {
        synchronized (diag) { java.util.Iterator<String> it = diag.keys(); List<String> ks = new ArrayList<>(); while (it.hasNext()) ks.add(it.next()); for (String k : ks) diag.remove(k); }
        anotar("inicio", System.currentTimeMillis());
        try {
            redWifi = buscarRedWifi();
            anotar("wifi", redWifi != null ? "sí" : "no encontrado (¿datos móviles o sin wifi?)");
            final long hasta = System.currentTimeMillis() + 7000;
            // Chromecast, Google TV, Android TV y TV Box con Chromecast se anuncian por mDNS: se buscan a la vez.
            final Runnable pararCast = buscarCast(hasta);
            Runnable pararCastGoogle = () -> { };
            try { pararCastGoogle = BuscadorCast.buscar(ctx, 8000); } catch (Throwable ignorado) { }
            final Runnable pararGoogle = pararCastGoogle;
            // Respaldo: si el router no deja pasar la búsqueda «a todos» (muchos la bloquean), se pregunta
            // TV por TV en la red del wifi por los puertos donde los TV abren YouTube.
            final Thread barrido = new Thread(() -> barrer(hasta));
            barrido.start();
            WifiManager wifi = ctx == null ? null : (WifiManager) ctx.getSystemService(Context.WIFI_SERVICE);
            WifiManager.MulticastLock candado = null;
            try {
                if (wifi != null) {
                    candado = wifi.createMulticastLock("vento-tv");
                    candado.setReferenceCounted(false);
                    candado.acquire();
                }
            } catch (Exception ignorado) { candado = null; }
            final Set<String> vistos = new HashSet<>();
            try (DatagramSocket sock = new DatagramSocket()) {
                Network red = redWifi;
                if (red != null && android.os.Build.VERSION.SDK_INT >= 23) try { red.bindSocket(sock); } catch (Exception ignorado) { }
                sock.setSoTimeout(500);
                sock.setBroadcast(true);
                InetAddress grupo = InetAddress.getByName(GRUPO);
                InetAddress todos = InetAddress.getByName("255.255.255.255");
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
                            if (envios == 1) try { sock.send(new DatagramPacket(b, b.length, todos, PUERTO)); } catch (Exception ignorado) { }
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
                        sumar("ssdp");
                        final String usn = cabecera(resp, "USN");
                        new Thread(() -> emitir(describir(ubicacion, usn))).start();
                    } catch (SocketTimeoutException t) {
                        // seguir esperando respuestas
                    }
                }
            } catch (Exception e) {
                // sin wifi o red que no deja: siguen el mDNS y el barrido
                anotar("ssdpError", String.valueOf(e.getMessage()));
            } finally {
                try { if (candado != null) candado.release(); } catch (Exception ignorado) { }
            }
            long falta = hasta + 1500 - System.currentTimeMillis();
            if (falta > 0) Thread.sleep(falta);   // que alcancen a llegar los Chromecast, el barrido y las descripciones
            try { barrido.join(3000); } catch (Exception ignorado) { }
            try { pararCast.run(); } catch (Exception ignorado) { }
            try { pararGoogle.run(); } catch (Throwable ignorado) { }
        } catch (Exception ignorado) {
        } finally {
            List<Oyente> a; int n;
            synchronized (CANDADO) { enCurso = false; a = new ArrayList<>(oyentes); oyentes.clear(); n = hallados.size(); }
            for (Oyente o : a) try { o.terminado(n); } catch (Exception ignorado) { }
        }
    }

    /** La red wifi (o cable) del celular, aunque los datos móviles o una VPN estén prendidos. */
    private Network buscarRedWifi() {
        if (ctx == null || android.os.Build.VERSION.SDK_INT < 23) return null;
        try {
            ConnectivityManager cm = (ConnectivityManager) ctx.getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null) return null;
            for (Network n : cm.getAllNetworks()) {
                NetworkCapabilities nc = cm.getNetworkCapabilities(n);
                if (nc == null) continue;
                if ((nc.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) || nc.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET))
                        && !nc.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) return n;
            }
        } catch (Exception ignorado) { }
        return null;
    }

    /** Los primeros tres números de la dirección del celular en el wifi (p. ej. «192.168.1.»). */
    private String subred() {
        String prueba = System.getProperty("vento.subred");
        if (prueba != null) return prueba;
        try {
            if (ctx != null && redWifi != null && android.os.Build.VERSION.SDK_INT >= 23) {
                ConnectivityManager cm = (ConnectivityManager) ctx.getSystemService(Context.CONNECTIVITY_SERVICE);
                LinkProperties lp = cm == null ? null : cm.getLinkProperties(redWifi);
                if (lp != null) for (LinkAddress la : lp.getLinkAddresses()) {
                    InetAddress a = la.getAddress();
                    if (a instanceof Inet4Address && a.isSiteLocalAddress()) return prefijo(a.getHostAddress());
                }
            }
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                String nom = ni.getName() == null ? "" : ni.getName();
                if (!ni.isUp() || ni.isLoopback() || !(nom.startsWith("wlan") || nom.startsWith("eth") || nom.startsWith("ap"))) continue;
                for (InetAddress a : Collections.list(ni.getInetAddresses()))
                    if (a instanceof Inet4Address && a.isSiteLocalAddress()) return prefijo(a.getHostAddress());
            }
        } catch (Exception ignorado) { }
        return null;
    }

    private static String prefijo(String ip) { int k = ip.lastIndexOf('.'); return k > 0 ? ip.substring(0, k + 1) : null; }

    /** Puertos donde los TV abren apps (DIAL): Chromecast/Android TV, LG webOS, Samsung, Roku. */
    private static final int[] PUERTOS = {8008, 36866, 8080, 8060};

    private void barrer(long hasta) {
        final String base = subred();
        anotar("subred", base == null ? "no se supo" : base + "x");
        if (base == null) return;
        // Por puertos (primero el de los Chromecast/Android TV), y en cada uno todas las direcciones a la vez:
        // así se recorre todo el wifi en 1–2 s. Antes se iba dirección por dirección y no alcanzaba a llegar
        // a las altas (p. ej. .150) antes de que se acabara el tiempo.
        final long fin = Math.max(hasta, System.currentTimeMillis() + 6000);
        for (final int puerto : PUERTOS) {
            if (System.currentTimeMillis() > fin) break;
            ExecutorService pool = Executors.newFixedThreadPool(64);
            final List<String> abiertos = Collections.synchronizedList(new ArrayList<>());
            try {
                for (int h = 1; h <= 254; h++) {
                    final String ip = base + h;
                    pool.execute(() -> { if (!yaEsta(ip) && abierto(ip, puerto)) abiertos.add(ip); });
                }
                pool.shutdown();
                pool.awaitTermination(Math.max(500, fin - System.currentTimeMillis()), TimeUnit.MILLISECONDS);
            } catch (Exception ignorado) {
            } finally { pool.shutdownNow(); }
            for (String ip : abiertos) agregar("puertos", ip + ":" + puerto);
            for (final String ip : new ArrayList<>(abiertos)) {
                new Thread(() -> {
                    // Un momento para que gane la descripción completa que llega por las otras búsquedas.
                    try { Thread.sleep(1200); } catch (Exception ignorado) { }
                    if (!yaEsta(ip)) emitir(describirPuerto(ip, puerto));
                }).start();
            }
        }
    }

    private static boolean abierto(String ip, int puerto) {
        try (Socket so = new Socket()) {
            Network red = redWifi;
            if (red != null && android.os.Build.VERSION.SDK_INT >= 23) try { red.bindSocket(so); } catch (Exception ignorado) { }
            so.connect(new InetSocketAddress(ip, puerto), 300);
            return true;
        } catch (Exception e) { return false; }
    }

    private static JSONObject describirPuerto(String ip, int puerto) {
        try {
            String appUrl, nombre = "", fabricante = "", modelo = "", tipo;
            if (puerto == 8008) {
                String[] d = pedir("http://" + ip + ":8008/ssdp/device-desc.xml");
                if (!"200".equals(d[0])) return null;
                nombre = etiqueta(d[1], "friendlyName"); fabricante = etiqueta(d[1], "manufacturer"); modelo = etiqueta(d[1], "modelName");
                appUrl = d[2].isEmpty() ? "http://" + ip + ":8008/apps/" : d[2];
                tipo = tipo(fabricante + " " + modelo + " " + nombre);
                if ("tv".equals(tipo)) tipo = "chromecast";
            } else if (puerto == 36866) {
                appUrl = "http://" + ip + ":36866/apps/"; fabricante = "LG Electronics"; nombre = "LG webOS TV"; tipo = "lg";
            } else if (puerto == 8080) {
                appUrl = "http://" + ip + ":8080/ws/app/"; fabricante = "Samsung"; nombre = "Samsung TV"; tipo = "samsung";
            } else {
                String[] d = pedir("http://" + ip + ":8060/query/device-info");
                if (!"200".equals(d[0])) return null;
                nombre = etiqueta(d[1], "user-device-name"); if (nombre.isEmpty()) nombre = etiqueta(d[1], "friendly-device-name");
                if (nombre.isEmpty()) nombre = "Roku"; fabricante = "Roku"; modelo = etiqueta(d[1], "model-name");
                appUrl = "http://" + ip + ":8060/dial/"; tipo = "roku";
            }
            if (!appUrl.endsWith("/")) appUrl = appUrl + "/";
            String[] ytr = estadoYouTube(appUrl + "YouTube");
            int yt = Integer.parseInt(ytr[0]);
            if (puerto != 8008 && (yt < 200 || yt >= 300)) return null;     // ese puerto no era de un TV con YouTube
            JSONObject tv = new JSONObject();
            tv.put("id", "ip:" + ip);
            tv.put("nombre", (nombre.isEmpty() ? "TV" : nombre) + (puerto == 36866 || puerto == 8080 ? " (" + ip + ")" : ""));
            tv.put("fabricante", fabricante);
            tv.put("modelo", modelo);
            tv.put("ip", ip);
            tv.put("tipo", tipo);
            if (yt >= 200 && yt < 300) tv.put("appUrl", appUrl); else tv.put("soloCodigo", true);
            marcarYouTube(tv, ytr, "");
            return tv;
        } catch (Exception e) {
            return null;
        }
    }

    /** GET con respuesta: {código, texto, cabecera Application-URL}. */
    private static String[] pedir(String url) {
        HttpURLConnection c = null;
        try {
            c = abrir(url);
            c.setConnectTimeout(1500);
            c.setReadTimeout(2000);
            int st = c.getResponseCode();
            String app = c.getHeaderField("Application-URL");
            String txt = st >= 200 && st < 300 ? leer(c.getInputStream()) : "";
            return new String[]{String.valueOf(st), txt, app == null ? "" : app};
        } catch (Exception e) {
            return new String[]{"-1", "", ""};
        } finally {
            if (c != null) c.disconnect();
        }
    }

    /** Conexión al TV por el wifi (aunque haya datos móviles o VPN). */
    static HttpURLConnection abrir(String url) throws java.io.IOException {
        Network red = redWifi;
        if (red != null && android.os.Build.VERSION.SDK_INT >= 23) {
            try { return (HttpURLConnection) red.openConnection(new URL(url)); } catch (Exception ignorado) { }
        }
        return (HttpURLConnection) new URL(url).openConnection();
    }

    /**
     * Busca por mDNS los aparatos con Chromecast integrado (_googlecast._tcp) y los Android TV
     * (_androidtvremote2._tcp). A cada uno se le abre YouTube por su servidor DIAL (puerto 8008),
     * igual que hace la app de YouTube. Si un aparato no deja abrirlo así, sale igual en la lista
     * (con la nota de usar el código del TV). Devuelve con qué se detiene la búsqueda.
     */
    private Runnable buscarCast(final long hasta) {
        if (ctx == null) return () -> { };
        final NsdManager nsd = (NsdManager) ctx.getSystemService(Context.NSD_SERVICE);
        if (nsd == null) return () -> { };
        final LinkedBlockingQueue<NsdServiceInfo> cola = new LinkedBlockingQueue<>();
        final String[] tipos = {"_googlecast._tcp", "_androidtvremote2._tcp"};
        final NsdManager.DiscoveryListener[] oyentes = new NsdManager.DiscoveryListener[tipos.length];
        for (int i = 0; i < tipos.length; i++) {
            oyentes[i] = new NsdManager.DiscoveryListener() {
                @Override public void onStartDiscoveryFailed(String t, int e) { anotar("mdnsError", t + " " + e); }
                @Override public void onStopDiscoveryFailed(String t, int e) { }
                @Override public void onDiscoveryStarted(String t) { }
                @Override public void onDiscoveryStopped(String t) { }
                @Override public void onServiceFound(NsdServiceInfo s) { sumar("mdns"); cola.offer(s); }
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
                if (r[0] == null) { sumar("mdnsSinResolver"); continue; }
                sumar("mdnsResueltos");
                final NsdServiceInfo x = r[0];
                new Thread(() -> emitir(describirCast(x))).start();
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
            String ip = null;
            if (android.os.Build.VERSION.SDK_INT >= 34) {
                try { for (InetAddress h : x.getHostAddresses()) if (h instanceof Inet4Address) { ip = h.getHostAddress(); break; } } catch (Throwable ignorado) { }
            }
            if (ip == null && x.getHost() instanceof Inet4Address) ip = x.getHost().getHostAddress();
            if (ip == null) return null;               // antes se botaba si Android la daba en IPv6 (así no salía el Chromecast)
            String nombre = atributo(x, "fn"), modelo = atributo(x, "md");
            boolean esCast = x.getServiceType() != null && x.getServiceType().contains("googlecast");
            if (nombre.isEmpty()) nombre = x.getServiceName().replaceAll("-[0-9a-f]{20,}$", "").replace('-', ' ');
            String appUrl = "http://" + ip + ":8008/apps/";
            String[] ytr = estadoYouTube(appUrl + "YouTube");
            int yt = Integer.parseInt(ytr[0]);
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
            // «rs» es lo que el aparato está mostrando ahora (p. ej. «YouTube»): lo mismo que YouTube pone como «Reproduciendo YouTube».
            String rs = atributo(x, "rs");
            if (!rs.isEmpty()) tv.put("app", rs);
            marcarYouTube(tv, ytr, rs);
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
            c = abrir(ubicacion);
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
            String[] ytr = estadoYouTube(appUrl + "YouTube");
            int yt = Integer.parseInt(ytr[0]);
            if (yt == 404) return null;
            JSONObject tv = new JSONObject();
            tv.put("id", usn != null ? usn : ubicacion);
            tv.put("nombre", nombre.isEmpty() ? (modelo.isEmpty() ? u.getHost() : modelo) : nombre);
            tv.put("fabricante", fabricante);
            tv.put("modelo", modelo);
            tv.put("ip", u.getHost());
            tv.put("appUrl", appUrl);
            tv.put("tipo", tipo(fabricante + " " + modelo + " " + nombre));
            marcarYouTube(tv, ytr, "");
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

    /**
     * Estado de la app de YouTube en el TV (DIAL): código HTTP y respuesta. Si YouTube está abierto
     * («running»), el TV suele contar su «screenId»: con él Vento se vincula sin volver a abrir YouTube
     * (no corta lo que está sonando), igual que hace la app de YouTube.
     */
    private static String[] estadoYouTube(String url) {
        HttpURLConnection c = null;
        try {
            c = abrir(url);
            c.setConnectTimeout(2000);
            c.setReadTimeout(2500);
            c.setRequestProperty("User-Agent", "Android Vento/1");
            int st = c.getResponseCode();
            String xml = "";
            if (st >= 200 && st < 300) try { xml = leer(c.getInputStream()); } catch (Exception ignorado) { }
            return new String[]{String.valueOf(st), xml};
        } catch (Exception e) {
            return new String[]{"-1", ""};
        } finally {
            if (c != null) c.disconnect();
        }
    }

    private static void marcarYouTube(JSONObject tv, String[] ytr, String rs) {
        try {
            String xml = ytr[1] == null ? "" : ytr[1];
            String st = etiqueta(xml, "state");
            String sid = etiqueta(xml, "screenId");
            boolean abierto = "running".equalsIgnoreCase(st) || rs.toLowerCase(Locale.ROOT).contains("youtube");
            if (abierto) tv.put("youtube", true);
            if (!sid.isEmpty()) tv.put("screenId", sid);
        } catch (Exception ignorado) { }
    }

    private static int estado(String url) {
        HttpURLConnection c = null;
        try {
            c = abrir(url);
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
            c = abrir(appUrl + "YouTube");
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
