import AppKit
import Foundation

@main
struct PixrIconGenerator {
    @MainActor static func main() throws {
        guard CommandLine.arguments.count == 4 else {
            fatalError("Usage: generate-icons <canonical-svg> <assets-directory> <iconset-directory>")
        }
        let source = URL(fileURLWithPath: CommandLine.arguments[1])
        let assets = URL(fileURLWithPath: CommandLine.arguments[2], isDirectory: true)
        guard let icon = NSImage(contentsOf: source) else {
            fatalError("Could not load canonical icon at \(source.path)")
        }
        let iconset = URL(fileURLWithPath: CommandLine.arguments[3], isDirectory: true)
        try? FileManager.default.removeItem(at: iconset)
        try FileManager.default.createDirectory(at: iconset, withIntermediateDirectories: true)

        let sizes = [16, 32, 64, 128, 180, 192, 256, 512, 1024]
        var pngs: [Int: URL] = [:]
        for size in sizes {
            let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size,
                                       bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true,
                                       isPlanar: false, colorSpaceName: .deviceRGB,
                                       bytesPerRow: 0, bitsPerPixel: 0)!
            NSGraphicsContext.saveGraphicsState()
            let context = NSGraphicsContext(bitmapImageRep: rep)!
            NSGraphicsContext.current = context
            context.imageInterpolation = .none
            NSColor.clear.setFill()
            NSRect(x: 0, y: 0, width: size, height: size).fill()
            icon.draw(in: NSRect(x: 0, y: 0, width: size, height: size),
                      from: .zero, operation: .copy, fraction: 1)
            context.flushGraphics()
            NSGraphicsContext.restoreGraphicsState()
            let data = rep.representation(using: .png, properties: [:])!
            let url = assets.appendingPathComponent("pixr-icon-\(size).png")
            try data.write(to: url, options: .atomic)
            pngs[size] = url
        }

        let iconsetFiles: [(String, Int)] = [
            ("icon_16x16.png", 16), ("icon_16x16@2x.png", 32),
            ("icon_32x32.png", 32), ("icon_32x32@2x.png", 64),
            ("icon_128x128.png", 128), ("icon_128x128@2x.png", 256),
            ("icon_256x256.png", 256), ("icon_256x256@2x.png", 512),
            ("icon_512x512.png", 512), ("icon_512x512@2x.png", 1024),
        ]
        for (name, size) in iconsetFiles {
            try FileManager.default.copyItem(at: pngs[size]!, to: iconset.appendingPathComponent(name))
        }
        try Data(contentsOf: pngs[180]!).write(to: assets.appendingPathComponent("apple-touch-icon.png"), options: .atomic)
        print("Rendered favicon, web manifest, app header, and macOS iconset from pixr-icon.svg")
    }
}
