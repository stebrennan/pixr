import AppKit
import WebKit
import UniformTypeIdentifiers

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, WKScriptMessageHandler, WKUIDelegate, NSWindowDelegate {
    private var window: NSWindow!
    private var webView: WKWebView!

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        let configuration = WKWebViewConfiguration()
        configuration.userContentController.add(self, name: "pixrNative")
        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = false
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1280, height: 850),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable],
                          backing: .buffered, defer: false)
        window.title = "Pixr"
        window.minSize = NSSize(width: 760, height: 580)
        window.center()
        window.contentView = webView
        window.delegate = self
        installMenu()
        if let page = Bundle.main.resourceURL?.appendingPathComponent("Web/index.html"),
           FileManager.default.fileExists(atPath: page.path) {
            webView.loadFileURL(page, allowingReadAccessTo: page.deletingLastPathComponent())
        } else {
            webView.loadHTMLString("<h1>Pixr resources are missing</h1>", baseURL: nil)
        }
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = NSAlert()
        alert.messageText = "Pixr"
        alert.informativeText = message
        alert.alertStyle = .warning
        alert.addButton(withTitle: "Continue")
        alert.addButton(withTitle: "Cancel")
        alert.beginSheetModal(for: window) { response in
            completionHandler(response == .alertFirstButtonReturn)
        }
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String,
                 defaultText: String?, initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping (String?) -> Void) {
        let alert = NSAlert()
        alert.messageText = "Pixr"
        alert.informativeText = prompt
        alert.addButton(withTitle: "OK")
        alert.addButton(withTitle: "Cancel")
        let textField = NSTextField(string: defaultText ?? "")
        textField.frame = NSRect(x: 0, y: 0, width: 260, height: 24)
        alert.accessoryView = textField
        alert.beginSheetModal(for: window) { response in
            completionHandler(response == .alertFirstButtonReturn ? textField.stringValue : nil)
        }
    }

    private func installMenu() {
        let main = NSMenu()
        let appItem = NSMenuItem(); main.addItem(appItem)
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "About Pixr", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(NSMenuItem.separator())
        appMenu.addItem(withTitle: "Quit Pixr", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu
        let fileItem = NSMenuItem(); main.addItem(fileItem)
        let fileMenu = NSMenu(title: "File")
        fileMenu.addItem(withTitle: "New Document…", action: #selector(newDocument), keyEquivalent: "n")
        fileMenu.addItem(withTitle: "Open Pixr File…", action: #selector(openProject), keyEquivalent: "o")
        fileMenu.addItem(withTitle: "Save Pixr File…", action: #selector(saveProject), keyEquivalent: "s")
        fileMenu.addItem(withTitle: "Close Document", action: #selector(closeDocument), keyEquivalent: "w")
        fileItem.submenu = fileMenu
        NSApp.mainMenu = main
    }

    @objc private func openProject() { chooseFiles(inputId: "project-file", accept: ".pixr,.json,.pixelworkshop,application/json", multiple: true) }
    @objc private func saveProject() {
        webView.evaluateJavaScript("document.getElementById('save-project').click()")
    }
    @objc private func newDocument() { webView.evaluateJavaScript("document.getElementById('new').click()") }
    @objc private func closeDocument() { webView.evaluateJavaScript("document.dispatchEvent(new KeyboardEvent('keydown', {key:'w', metaKey:true, bubbles:true}))") }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
        switch type {
        case "open-files":
            chooseFiles(inputId: body["inputId"] as? String ?? "", accept: body["accept"] as? String ?? "", multiple: body["multiple"] as? Bool ?? false)
        case "save-file":
            saveFile(requestId: body["requestId"] as? String ?? "", filename: body["filename"] as? String ?? "Pixr-export", base64: body["base64"] as? String ?? "")
        default: break
        }
    }

    private func chooseFiles(inputId: String, accept: String, multiple: Bool) {
        let panel = NSOpenPanel()
        panel.canChooseFiles = true; panel.canChooseDirectories = false; panel.allowsMultipleSelection = multiple
        let extensions = accept.split(separator: ",").compactMap { token -> String? in
            let value = token.trimmingCharacters(in: .whitespaces).lowercased()
            return value.hasPrefix(".") ? String(value.dropFirst()) : nil
        }
        if !extensions.isEmpty { panel.allowedContentTypes = extensions.compactMap { UTType(filenameExtension: $0) } }
        panel.begin { [weak self] response in
            guard response == .OK, let self else { return }
            let items = panel.urls.compactMap { url -> [String: String]? in
                guard let data = try? Data(contentsOf: url) else { return nil }
                return ["name": url.lastPathComponent, "base64": data.base64EncodedString(), "type": UTType(filenameExtension: url.pathExtension)?.preferredMIMEType ?? "application/octet-stream"]
            }
            guard let encoded = try? JSONSerialization.data(withJSONObject: items),
                  let json = String(data: encoded, encoding: .utf8),
                  let arg = Self.javascriptString(json), let target = Self.javascriptString(inputId) else { return }
            self.webView.evaluateJavaScript("window.PixrNative.acceptFiles(\(target), JSON.parse(\(arg)))")
        }
    }

    private func saveFile(requestId: String, filename: String, base64: String) {
        guard let data = Data(base64Encoded: base64) else { completeSave(requestId, ok: false); return }
        let panel = NSSavePanel(); panel.nameFieldStringValue = filename; panel.canCreateDirectories = true
        if let type = UTType(filenameExtension: URL(fileURLWithPath: filename).pathExtension) { panel.allowedContentTypes = [type] }
        panel.begin { [weak self] response in
            guard response == .OK, let url = panel.url else { self?.completeSave(requestId, ok: false); return }
            do { try data.write(to: url, options: .atomic); self?.completeSave(requestId, ok: true) }
            catch { NSSound.beep(); self?.completeSave(requestId, ok: false) }
        }
    }

    private func completeSave(_ requestId: String, ok: Bool) {
        guard let id = Self.javascriptString(requestId) else { return }
        webView.evaluateJavaScript("window.PixrNative.completeSave(\(id), \(ok ? "true" : "false"))")
    }

    private static func javascriptString(_ value: String) -> String? {
        guard let data = try? JSONSerialization.data(withJSONObject: [value]),
              let json = String(data: data, encoding: .utf8) else { return nil }
        return String(json.dropFirst().dropLast())
    }
}

@main
struct PixrMain {
    @MainActor static func main() {
        let app = NSApplication.shared
        let delegate = AppDelegate()
        app.delegate = delegate
        app.run()
    }
}
