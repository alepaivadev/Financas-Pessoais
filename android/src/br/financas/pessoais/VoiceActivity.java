package br.financas.pessoais;

// Tela aberta pelo widget: o mesmo app, em modo rápido, só com o cadastro por voz.
public class VoiceActivity extends MainActivity {
    @Override
    protected String startUrl() {
        return "https://app.financas.local/index.html?voz=1";
    }
}
