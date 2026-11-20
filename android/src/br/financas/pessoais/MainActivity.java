package br.financas.pessoais;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.graphics.Color;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.speech.RecognizerIntent;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;
import android.window.OnBackInvokedDispatcher;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;

public class MainActivity extends Activity {
    // Endereço interno: nada sai do aparelho, tudo é respondido a partir dos arquivos do APK.
    private static final String HOST = "app.financas.local";
    private static final String START_URL = "https://" + HOST + "/index.html";
    private static final int PICK_FILE = 1;
    private static final int SAVE_FILE = 2;
    private static final int VOICE = 3;

    private WebView web;
    private ValueCallback<Uri[]> pickCallback;
    private String pendingContent;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        FrameLayout root = new FrameLayout(this);
        web = new WebView(this);
        web.setBackgroundColor(Color.TRANSPARENT);
        root.addView(web);
        setContentView(root);
        applySystemBarInsets(root);

        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        // Sem efeito de "esticar" nas bordas e sem arrastar a página para os lados.
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setHorizontalScrollBarEnabled(false);

        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            WebView.setWebContentsDebuggingEnabled(true);
        }

        web.setWebViewClient(new LocalClient());
        web.setWebChromeClient(new FileChooserClient());
        web.addJavascriptInterface(new Bridge(), "AndroidApp");

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::handleBack);
        }

        if (savedInstanceState == null) {
            web.loadUrl(startUrl());
        } else {
            web.restoreState(savedInstanceState);
        }
    }

    private void applySystemBarInsets(FrameLayout root) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return;
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.ime());
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return WindowInsets.CONSUMED;
        });
    }

    // A tela de voz do widget abre o mesmo app em modo rápido.
    protected String startUrl() {
        return START_URL;
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        handleBack();
    }

    // O botão Voltar fecha a janela aberta no app; sem janela aberta, sai do app.
    private void handleBack() {
        String closeDialog = "(() => { const open = [...document.querySelectorAll('dialog[open]')].pop();"
                + " if (open) open.close(); return !!open; })()";
        web.evaluateJavascript(closeDialog, closed -> {
            if (!"true".equals(closed)) finish();
        });
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == VOICE) {
            ArrayList<String> results = resultCode == RESULT_OK && data != null
                    ? data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS) : null;
            if (results != null && !results.isEmpty()) {
                web.evaluateJavascript("window.onVoiceResult?.(" + org.json.JSONObject.quote(results.get(0)) + ")", null);
            } else {
                web.evaluateJavascript("window.onVoiceCancel?.()", null);
            }
            return;
        }
        Uri uri = resultCode == RESULT_OK && data != null ? data.getData() : null;
        if (requestCode == PICK_FILE && pickCallback != null) {
            pickCallback.onReceiveValue(uri == null ? null : new Uri[] { uri });
            pickCallback = null;
        } else if (requestCode == SAVE_FILE) {
            boolean saved = uri != null && writeFile(uri);
            pendingContent = null;
            web.evaluateJavascript("window.onNativeFileSaved?.(" + saved + ")", null);
        }
    }

    private boolean writeFile(Uri uri) {
        try (OutputStream out = getContentResolver().openOutputStream(uri, "wt")) {
            if (out == null) return false;
            out.write(pendingContent.getBytes(StandardCharsets.UTF_8));
            return true;
        } catch (IOException | SecurityException e) {
            return false;
        }
    }

    private static String mimeOf(String path) {
        if (path.endsWith(".html")) return "text/html";
        if (path.endsWith(".js")) return "text/javascript";
        if (path.endsWith(".css")) return "text/css";
        if (path.endsWith(".png")) return "image/png";
        if (path.endsWith(".svg")) return "image/svg+xml";
        if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
        if (path.endsWith(".woff2")) return "font/woff2";
        if (path.endsWith(".webmanifest")) return "application/manifest+json";
        return "application/json";
    }

    private class LocalClient extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri url = request.getUrl();
            if (!HOST.equals(url.getHost())) return notFound();
            String path = url.getPath() == null ? "" : url.getPath().replaceFirst("^/", "");
            if (path.isEmpty()) path = "index.html";
            if (path.contains("..")) return notFound();
            try {
                InputStream stream = getAssets().open("www/" + path);
                return new WebResourceResponse(mimeOf(path), "UTF-8", 200, "OK",
                        Collections.emptyMap(), stream);
            } catch (IOException e) {
                return notFound();
            }
        }

        private WebResourceResponse notFound() {
            return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found",
                    Collections.emptyMap(), new java.io.ByteArrayInputStream(new byte[0]));
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return !HOST.equals(request.getUrl().getHost());
        }
    }

    private class FileChooserClient extends WebChromeClient {
        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (pickCallback != null) pickCallback.onReceiveValue(null);
            pickCallback = callback;
            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("*/*");
            startActivityForResult(intent, PICK_FILE);
            return true;
        }
    }

    private class Bridge {
        // Fecha a tela de voz do widget, avisando o resultado.
        @JavascriptInterface
        public void close(String message) {
            runOnUiThread(() -> {
                if (message != null && !message.isEmpty()) Toast.makeText(MainActivity.this, message, Toast.LENGTH_SHORT).show();
                finish();
            });
        }

        // Usa o reconhecedor de voz do próprio aparelho (normalmente o do Google).
        // Quem acessa o microfone é ele, então este app continua sem pedir permissão nenhuma.
        @JavascriptInterface
        public void startVoice() {
            runOnUiThread(() -> {
                Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "pt-BR");
                intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
                intent.putExtra(RecognizerIntent.EXTRA_PROMPT, "Ex.: Uber 25  ·  30 vestuário, calção");
                try {
                    startActivityForResult(intent, VOICE);
                } catch (ActivityNotFoundException e) {
                    web.evaluateJavascript("window.onVoiceError?.('Este celular não tem reconhecimento de voz. Instale ou ative o app do Google.')", null);
                }
            });
        }

        @JavascriptInterface
        public void saveFile(String name, String mime, String content) {
            runOnUiThread(() -> {
                pendingContent = content;
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType(mime);
                intent.putExtra(Intent.EXTRA_TITLE, name);
                startActivityForResult(intent, SAVE_FILE);
            });
        }
    }
}
