import AppKit
import WebKit
import UniformTypeIdentifiers

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, WKScriptMessageHandler, WKUIDelegate, NSWindowDelegate {
    private var window: NSWindow!
    private var webView: WKWebView!
    private var recentMenu: NSMenu!
    private let recentKey = "PixrRecentFiles"

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
        fileMenu.addItem(withTitle: "New", action: #selector(newDocument), keyEquivalent: "n")
        fileMenu.addItem(withTitle: "Open", action: #selector(openFiles), keyEquivalent: "o")
        let recentItem = NSMenuItem(title: "Open Recent", action: nil, keyEquivalent: "")
        recentMenu = NSMenu(title: "Open Recent"); recentItem.submenu = recentMenu; fileMenu.addItem(recentItem)
        fileMenu.addItem(NSMenuItem.separator())
        fileMenu.addItem(withTitle: "Save", action: #selector(saveProject), keyEquivalent: "s")
        fileMenu.addItem(withTitle: "Save As", action: #selector(saveProjectAs), keyEquivalent: "S")
        fileMenu.addItem(NSMenuItem.separator())
        fileMenu.addItem(withTitle: "Export Current Frame", action: #selector(exportFrame), keyEquivalent: "")
        fileMenu.addItem(withTitle: "Export Animation Sheet", action: #selector(exportSheet), keyEquivalent: "")
        fileMenu.addItem(withTitle: "Export Palette", action: #selector(exportPalette), keyEquivalent: "")
        fileItem.submenu = fileMenu
        rebuildRecentMenu()
        let editItem = NSMenuItem(); main.addItem(editItem)
        let editMenu = NSMenu(title: "Edit")
        editMenu.addItem(NSMenuItem(title: "Undo", action: Selector(("undo:")), keyEquivalent: "z"))
        editMenu.addItem(NSMenuItem(title: "Redo", action: Selector(("redo:")), keyEquivalent: "Z"))
        editMenu.addItem(NSMenuItem.separator())
        editMenu.addItem(NSMenuItem(title: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x"))
        editMenu.addItem(NSMenuItem(title: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c"))
        editMenu.addItem(NSMenuItem(title: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v"))
        editMenu.addItem(NSMenuItem(title: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a"))
        editItem.submenu = editMenu
        NSApp.mainMenu = main
    }

    @objc private func openFiles() { chooseFiles(inputId: "open-files-input", accept: ".png,image/png,.pixr,.json,.pixelworkshop,application/json", multiple: true) }
    @objc private func saveProject() {
        webView.evaluateJavaScript("document.getElementById('save-project').click()")
    }
    @objc private func saveProjectAs() { webView.evaluateJavaScript("document.getElementById('save-as').click()") }
    @objc private func exportFrame() { webView.evaluateJavaScript("document.getElementById('export-png').click()") }
    @objc private func exportSheet() { webView.evaluateJavaScript("document.getElementById('export-sheet').click()") }
    @objc private func exportPalette() { webView.evaluateJavaScript("document.getElementById('export-palette').click()") }
    @objc private func newDocument() { webView.evaluateJavaScript("document.getElementById('new').click()") }
    @objc private func openRecent(_ sender: NSMenuItem) {
        guard let path = sender.representedObject as? String else { return }
        openURLs([URL(fileURLWithPath: path)])
    }

    private func rebuildRecentMenu() {
        guard let recentMenu else { return }
        recentMenu.removeAllItems()
        let paths = UserDefaults.standard.stringArray(forKey: recentKey) ?? []
        if paths.isEmpty { recentMenu.addItem(NSMenuItem(title: "No Recent Items", action: nil, keyEquivalent: "")); return }
        for path in paths {
            let item = NSMenuItem(title: URL(fileURLWithPath: path).lastPathComponent, action: #selector(openRecent(_:)), keyEquivalent: "")
            item.representedObject = path; item.target = self; recentMenu.addItem(item)
        }
        recentMenu.addItem(NSMenuItem.separator())
        let clearItem = NSMenuItem(title: "Clear Menu", action: #selector(clearRecent), keyEquivalent: "")
        clearItem.target = self; recentMenu.addItem(clearItem)
    }

    @objc private func clearRecent() { UserDefaults.standard.removeObject(forKey: recentKey); rebuildRecentMenu() }

    private func rememberRecent(_ urls: [URL]) {
        var paths = UserDefaults.standard.stringArray(forKey: recentKey) ?? []
        for url in urls { paths.removeAll { $0 == url.path }; paths.insert(url.path, at: 0) }
        UserDefaults.standard.set(Array(paths.prefix(10)), forKey: recentKey); rebuildRecentMenu()
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
        switch type {
        case "open-files":
            chooseFiles(inputId: body["inputId"] as? String ?? "", accept: body["accept"] as? String ?? "", multiple: body["multiple"] as? Bool ?? false)
        case "save-file":
            saveFile(requestId: body["requestId"] as? String ?? "", filename: body["filename"] as? String ?? "Pixr-export", directory: body["directory"] as? String ?? "", savePath: body["savePath"] as? String ?? "", saveAs: body["saveAs"] as? Bool ?? false, base64: body["base64"] as? String ?? "")
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
            self.rememberRecent(panel.urls)
            self.openURLs(panel.urls, inputId: inputId)
        }
    }

    private func openURLs(_ urls: [URL], inputId: String = "open-files-input") {
        let items = urls.compactMap { url -> [String: String]? in
                guard let data = try? Data(contentsOf: url) else { return nil }
                return ["name": url.lastPathComponent, "sourcePath": url.path, "base64": data.base64EncodedString(), "type": UTType(filenameExtension: url.pathExtension)?.preferredMIMEType ?? "application/octet-stream"]
        }
        guard let encoded = try? JSONSerialization.data(withJSONObject: items),
              let json = String(data: encoded, encoding: .utf8),
              let arg = Self.javascriptString(json), let target = Self.javascriptString(inputId) else { return }
        webView.evaluateJavaScript("window.PixrNative.acceptFiles(\(target), JSON.parse(\(arg)))")
    }

    private func saveFile(requestId: String, filename: String, directory: String, savePath: String, saveAs: Bool, base64: String) {
        guard let data = Data(base64Encoded: base64) else { completeSave(requestId, ok: false); return }
        if !saveAs, !savePath.isEmpty {
            let destination = URL(fileURLWithPath: savePath)
            do { try data.write(to: destination, options: .atomic); completeSave(requestId, ok: true, path: destination.path) }
            catch { NSSound.beep(); completeSave(requestId, ok: false) }
            return
        }
        let panel = NSSavePanel(); panel.canCreateDirectories = true
        let sourceDirectory = directory.isEmpty ? nil : URL(fileURLWithPath: directory, isDirectory: true)
        if let sourceDirectory { panel.directoryURL = sourceDirectory }
        panel.isExtensionHidden = false
        if let type = UTType(filenameExtension: URL(fileURLWithPath: filename).pathExtension) { panel.allowedContentTypes = [type] }
        panel.nameFieldStringValue = URL(fileURLWithPath: filename).deletingPathExtension().lastPathComponent
        panel.begin { [weak self] response in
            guard response == .OK, let url = panel.url else { self?.completeSave(requestId, ok: false); return }
            do { try data.write(to: url, options: .atomic); self?.completeSave(requestId, ok: true, path: url.path) }
            catch { NSSound.beep(); self?.completeSave(requestId, ok: false) }
        }
    }

    private func completeSave(_ requestId: String, ok: Bool, path: String = "") {
        guard let id = Self.javascriptString(requestId), let encodedPath = Self.javascriptString(path) else { return }
        webView.evaluateJavaScript("window.PixrNative.completeSave(\(id), \(ok ? "true" : "false"), \(encodedPath))")
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
