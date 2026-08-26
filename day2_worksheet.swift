import AppKit
import PDFKit
import Foundation

let pageSize = NSSize(width: 595, height: 842) // A4, 72 dpi
let requestedOutputPath = ProcessInfo.processInfo.environment["WORKSHEET_OUTPUT_DIR"]
let outputDirectory = requestedOutputPath.map { URL(fileURLWithPath: $0, isDirectory: true) }
    ?? URL(fileURLWithPath: FileManager.default.currentDirectoryPath).appendingPathComponent("output", isDirectory: true)
let previewDirectory = URL(fileURLWithPath: "/private/tmp/day2-worksheet-previews", isDirectory: true)

try FileManager.default.createDirectory(at: outputDirectory, withIntermediateDirectories: true)
try FileManager.default.createDirectory(at: previewDirectory, withIntermediateDirectories: true)

enum Palette {
    static let ink = NSColor(calibratedRed: 0.15, green: 0.19, blue: 0.24, alpha: 1)
    static let muted = NSColor(calibratedRed: 0.36, green: 0.42, blue: 0.49, alpha: 1)
    static let blue = NSColor(calibratedRed: 0.20, green: 0.55, blue: 0.78, alpha: 1)
    static let blueLight = NSColor(calibratedRed: 0.88, green: 0.95, blue: 0.99, alpha: 1)
    static let yellow = NSColor(calibratedRed: 0.98, green: 0.78, blue: 0.28, alpha: 1)
    static let yellowLight = NSColor(calibratedRed: 1.00, green: 0.97, blue: 0.84, alpha: 1)
    static let coral = NSColor(calibratedRed: 0.94, green: 0.43, blue: 0.40, alpha: 1)
    static let coralLight = NSColor(calibratedRed: 1.00, green: 0.91, blue: 0.90, alpha: 1)
    static let green = NSColor(calibratedRed: 0.34, green: 0.67, blue: 0.50, alpha: 1)
    static let greenLight = NSColor(calibratedRed: 0.89, green: 0.97, blue: 0.92, alpha: 1)
    static let purple = NSColor(calibratedRed: 0.51, green: 0.44, blue: 0.76, alpha: 1)
    static let purpleLight = NSColor(calibratedRed: 0.94, green: 0.92, blue: 0.98, alpha: 1)
    static let paper = NSColor.white
    static let line = NSColor(calibratedWhite: 0.76, alpha: 1)
}

func font(_ size: CGFloat, bold: Bool = false) -> NSFont {
    bold ? NSFont.systemFont(ofSize: size, weight: .bold) : NSFont.systemFont(ofSize: size, weight: .regular)
}

func paragraphStyle(alignment: NSTextAlignment = .left, lineSpacing: CGFloat = 1.5) -> NSParagraphStyle {
    let style = NSMutableParagraphStyle()
    style.alignment = alignment
    style.lineSpacing = lineSpacing
    style.lineBreakMode = .byWordWrapping
    return style
}

func drawText(_ string: String, in rect: NSRect, size: CGFloat, bold: Bool = false,
              color: NSColor = Palette.ink, alignment: NSTextAlignment = .left,
              lineSpacing: CGFloat = 1.5) {
    let attrs: [NSAttributedString.Key: Any] = [
        .font: font(size, bold: bold),
        .foregroundColor: color,
        .paragraphStyle: paragraphStyle(alignment: alignment, lineSpacing: lineSpacing)
    ]
    NSAttributedString(string: string, attributes: attrs).draw(with: rect,
        options: [.usesLineFragmentOrigin, .usesFontLeading])
}

func roundedRect(_ rect: NSRect, radius: CGFloat = 10, fill: NSColor = .white,
                 stroke: NSColor = Palette.line, width: CGFloat = 1.2) {
    let path = NSBezierPath(roundedRect: rect, xRadius: radius, yRadius: radius)
    fill.setFill()
    path.fill()
    stroke.setStroke()
    path.lineWidth = width
    path.stroke()
}

func line(from: NSPoint, to: NSPoint, color: NSColor = Palette.line,
          width: CGFloat = 1.2, dash: [CGFloat]? = nil) {
    let path = NSBezierPath()
    path.move(to: from)
    path.line(to: to)
    color.setStroke()
    path.lineWidth = width
    if let dash { path.setLineDash(dash, count: dash.count, phase: 0) }
    path.stroke()
}

func circle(center: NSPoint, radius: CGFloat, fill: NSColor,
            stroke: NSColor = Palette.ink, width: CGFloat = 1.0) {
    let rect = NSRect(x: center.x - radius, y: center.y - radius,
                      width: radius * 2, height: radius * 2)
    let path = NSBezierPath(ovalIn: rect)
    fill.setFill()
    path.fill()
    stroke.setStroke()
    path.lineWidth = width
    path.stroke()
}

func square(center: NSPoint, radius: CGFloat, fill: NSColor) {
    let rect = NSRect(x: center.x - radius, y: center.y - radius,
                      width: radius * 2, height: radius * 2)
    roundedRect(rect, radius: 3, fill: fill, stroke: Palette.ink, width: 1)
}

func triangle(center: NSPoint, radius: CGFloat, fill: NSColor) {
    let path = NSBezierPath()
    path.move(to: NSPoint(x: center.x, y: center.y - radius))
    path.line(to: NSPoint(x: center.x + radius, y: center.y + radius))
    path.line(to: NSPoint(x: center.x - radius, y: center.y + radius))
    path.close()
    fill.setFill()
    path.fill()
    Palette.ink.setStroke()
    path.lineWidth = 1
    path.stroke()
}

func star(center: NSPoint, radius: CGFloat, fill: NSColor) {
    let path = NSBezierPath()
    for i in 0..<10 {
        let currentRadius = i % 2 == 0 ? radius : radius * 0.45
        let angle = CGFloat(i) * .pi / 5 - .pi / 2
        let point = NSPoint(x: center.x + cos(angle) * currentRadius,
                            y: center.y + sin(angle) * currentRadius)
        i == 0 ? path.move(to: point) : path.line(to: point)
    }
    path.close()
    fill.setFill()
    path.fill()
    Palette.ink.setStroke()
    path.lineWidth = 1
    path.stroke()
}

func drawShape(center: NSPoint, radius: CGFloat, kind: Int, fill: NSColor) {
    switch kind % 4 {
    case 1:
        square(center: center, radius: radius, fill: fill)
    case 2:
        triangle(center: center, radius: radius, fill: fill)
    case 3:
        star(center: center, radius: radius * 1.12, fill: fill)
    default:
        circle(center: center, radius: radius, fill: fill)
    }
}

func clusterPositions(count: Int, variant: Int) -> [NSPoint] {
    let triangle: [NSPoint] = [
        NSPoint(x: 0.50, y: 0.27), NSPoint(x: 0.28, y: 0.72), NSPoint(x: 0.72, y: 0.72)
    ]
    let row: [NSPoint] = [
        NSPoint(x: 0.22, y: 0.50), NSPoint(x: 0.50, y: 0.50), NSPoint(x: 0.78, y: 0.50)
    ]
    let diagonal: [NSPoint] = [
        NSPoint(x: 0.25, y: 0.28), NSPoint(x: 0.50, y: 0.50), NSPoint(x: 0.75, y: 0.72)
    ]
    let four: [NSPoint] = [
        NSPoint(x: 0.30, y: 0.30), NSPoint(x: 0.70, y: 0.30),
        NSPoint(x: 0.30, y: 0.70), NSPoint(x: 0.70, y: 0.70)
    ]
    switch count {
    case 1:
        return [NSPoint(x: 0.50, y: 0.50)]
    case 2:
        return variant % 2 == 0
            ? [NSPoint(x: 0.34, y: 0.40), NSPoint(x: 0.66, y: 0.60)]
            : [NSPoint(x: 0.30, y: 0.50), NSPoint(x: 0.70, y: 0.50)]
    case 3:
        switch variant % 3 {
        case 1: return row
        case 2: return diagonal
        default: return triangle
        }
    case 4:
        return four
    default:
        return [
            NSPoint(x: 0.27, y: 0.28), NSPoint(x: 0.73, y: 0.28),
            NSPoint(x: 0.50, y: 0.50), NSPoint(x: 0.27, y: 0.72),
            NSPoint(x: 0.73, y: 0.72)
        ]
    }
}

func drawQuantity(in rect: NSRect, count: Int, variant: Int, kind: Int,
                  color: NSColor, radius: CGFloat = 7) {
    for point in clusterPositions(count: count, variant: variant) {
        drawShape(center: NSPoint(x: rect.minX + point.x * rect.width,
                                  y: rect.minY + point.y * rect.height),
                  radius: radius, kind: kind, fill: color)
    }
}

// Two clearly separated groups. The gap, position, and color make the grouping visible.
func drawSplitQuantity(in rect: NSRect, left: Int, right: Int, variant: Int,
                       leftKind: Int, rightKind: Int,
                       leftColor: NSColor = Palette.blue,
                       rightColor: NSColor = Palette.coral,
                       radius: CGFloat = 5.5) {
    let leftRect = NSRect(x: rect.minX, y: rect.minY,
                          width: rect.width * 0.49, height: rect.height)
    let rightRect = NSRect(x: rect.minX + rect.width * 0.56, y: rect.minY,
                           width: rect.width * 0.38, height: rect.height)
    drawQuantity(in: leftRect, count: left, variant: variant,
                 kind: leftKind, color: leftColor, radius: radius)
    drawQuantity(in: rightRect, count: right, variant: variant + 1,
                 kind: rightKind, color: rightColor, radius: radius)
}

func sectionLabel(_ number: String, _ title: String, y: CGFloat, color: NSColor) {
    circle(center: NSPoint(x: 39, y: y + 12), radius: 12, fill: color, stroke: color)
    drawText(number, in: NSRect(x: 27, y: y + 2, width: 24, height: 22),
             size: 13, bold: true, color: .white, alignment: .center)
    drawText(title, in: NSRect(x: 58, y: y, width: 505, height: 28),
             size: 17, bold: true)
}

func drawHeader(title: String, subtitle: String, page: Int,
                accent: NSColor, light: NSColor) {
    roundedRect(NSRect(x: 24, y: 20, width: 547, height: 78), radius: 18,
                fill: light, stroke: accent, width: 2)
    circle(center: NSPoint(x: 60, y: 59), radius: 23, fill: accent, stroke: accent)
    drawText("2", in: NSRect(x: 43, y: 39, width: 34, height: 36),
             size: 25, bold: true, color: .white, alignment: .center)
    drawText("DAY 2  ·  \(title)", in: NSRect(x: 96, y: 32, width: 365, height: 31),
             size: 21, bold: true)
    drawText(subtitle, in: NSRect(x: 97, y: 63, width: 430, height: 22),
             size: 11.5, color: Palette.muted)
    drawText("이름", in: NSRect(x: 423, y: 34, width: 28, height: 18),
             size: 10.5, color: Palette.muted)
    line(from: NSPoint(x: 454, y: 50), to: NSPoint(x: 548, y: 50),
         color: Palette.muted, width: 0.8)
    drawText("\(page) / 4", in: NSRect(x: 505, y: 73, width: 43, height: 18),
             size: 9.5, color: Palette.muted, alignment: .right)
}

func drawFooter(_ message: String) {
    line(from: NSPoint(x: 27, y: 813), to: NSPoint(x: 568, y: 813),
         color: Palette.line, width: 0.7)
    drawText(message, in: NSRect(x: 30, y: 819, width: 535, height: 17),
             size: 9.3, color: Palette.muted, alignment: .center)
}

func optionBubble(number: Int, center: NSPoint, radius: CGFloat = 12,
                  color: NSColor = Palette.muted) {
    circle(center: center, radius: radius, fill: .white, stroke: color, width: 1)
    drawText("\(number)", in: NSRect(x: center.x - radius, y: center.y - radius + 2,
                                     width: radius * 2, height: radius * 2),
             size: radius > 14 ? 16 : 13, bold: true,
             color: Palette.ink, alignment: .center)
}

func arrow(from: NSPoint, to: NSPoint, color: NSColor = Palette.blue,
           width: CGFloat = 1.8) {
    line(from: from, to: to, color: color, width: width)
    let dx = to.x - from.x
    let dy = to.y - from.y
    let length = max(0.1, sqrt(dx * dx + dy * dy))
    let ux = dx / length
    let uy = dy / length
    let side = NSPoint(x: to.x - ux * 7 - uy * 4,
                       y: to.y - uy * 7 + ux * 4)
    let otherSide = NSPoint(x: to.x - ux * 7 + uy * 4,
                            y: to.y - uy * 7 - ux * 4)
    line(from: side, to: to, color: color, width: width)
    line(from: otherSide, to: to, color: color, width: width)
}

func drawNumberLine(in rect: NSRect, start: Int, target: Int,
                    operation: String, accent: NSColor) {
    let lineY = rect.minY + rect.height * 0.58
    let firstX = rect.minX + 25
    let lastX = rect.maxX - 25
    let step = (lastX - firstX) / 4
    line(from: NSPoint(x: firstX, y: lineY),
         to: NSPoint(x: lastX, y: lineY),
         color: Palette.muted, width: 1.3)
    for number in 1...5 {
        let x = firstX + CGFloat(number - 1) * step
        line(from: NSPoint(x: x, y: lineY - 6),
             to: NSPoint(x: x, y: lineY + 6),
             color: Palette.muted, width: 1.1)
        drawText("\(number)", in: NSRect(x: x - 11, y: lineY + 8,
                                         width: 22, height: 18),
                 size: 11, bold: true, color: Palette.ink, alignment: .center)
    }
    let startX = firstX + CGFloat(start - 1) * step
    let targetX = firstX + CGFloat(target - 1) * step
    circle(center: NSPoint(x: startX, y: lineY), radius: 9,
           fill: Palette.yellowLight, stroke: Palette.yellow, width: 1.1)
    arrow(from: NSPoint(x: startX, y: lineY - 18),
          to: NSPoint(x: targetX, y: lineY - 18),
          color: accent, width: 1.8)
    drawText("\(start) \(operation) 1",
             in: NSRect(x: rect.minX, y: rect.minY, width: rect.width, height: 17),
             size: 10.5, bold: true, color: accent, alignment: .center)
}

final class ChildPage: NSView {
    let pageNumber: Int

    init(page: Int) {
        pageNumber = page
        super.init(frame: NSRect(origin: .zero, size: pageSize))
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override var isFlipped: Bool { true }

    override func draw(_ dirtyRect: NSRect) {
        Palette.paper.setFill()
        bounds.fill()
        switch pageNumber {
        case 1: drawPageOne()
        case 2: drawPageTwo()
        case 3: drawPageThree()
        default: drawPageFour()
        }
    }

    func drawChangeCard(_ rect: NSRect, start: Int, operation: String,
                        result: Int?, index: Int, fill: NSColor = .white,
                        stroke: NSColor = Palette.line, answer: Bool = false,
                        compact: Bool = false) {
        roundedRect(rect, radius: compact ? 11 : 12, fill: fill, stroke: stroke, width: 1.1)
        drawText("\(index)", in: NSRect(x: rect.minX + 7, y: rect.minY + 6,
                                        width: 21, height: 17),
                 size: 8.5, bold: true, color: Palette.muted)
        let leftColor = index % 2 == 0 ? Palette.blue : Palette.green
        let rightColor = index % 2 == 0 ? Palette.coral : Palette.purple

        if compact {
            drawQuantity(
                in: NSRect(x: rect.minX + 8, y: rect.minY + 22, width: 36, height: 42),
                count: start, variant: index, kind: index % 4,
                color: leftColor, radius: 4.4)
            drawText("\(operation)1",
                     in: NSRect(x: rect.minX + 43, y: rect.minY + 34,
                                width: 28, height: 22),
                     size: 13, bold: true, color: Palette.ink, alignment: .center)
            if let result, !answer {
                drawText("\(result)",
                         in: NSRect(x: rect.maxX - 27, y: rect.minY + 32,
                                    width: 21, height: 24),
                         size: 16, bold: true, color: rightColor, alignment: .center)
            } else {
                roundedRect(NSRect(x: rect.maxX - 27, y: rect.minY + 28,
                                   width: 21, height: 29), radius: 4,
                            fill: .white, stroke: Palette.ink, width: 1)
            }
            return
        }

        drawQuantity(
            in: NSRect(x: rect.minX + 10, y: rect.minY + 22,
                       width: rect.width * 0.25, height: rect.height - 45),
            count: start, variant: index, kind: index % 4,
            color: leftColor, radius: rect.height > 105 ? 5.5 : 4.5)
        drawText("\(operation) 1",
                 in: NSRect(x: rect.minX + rect.width * 0.28,
                            y: rect.minY + 32, width: rect.width * 0.27, height: 25),
                 size: rect.height > 105 ? 15 : 13, bold: true,
                 color: Palette.ink, alignment: .center)
        if let result, !answer {
            drawQuantity(
                in: NSRect(x: rect.minX + rect.width * 0.61, y: rect.minY + 22,
                           width: rect.width * 0.25, height: rect.height - 45),
                count: result, variant: index + 1, kind: (index + 2) % 4,
                color: rightColor, radius: rect.height > 105 ? 5.5 : 4.5)
        } else {
            roundedRect(NSRect(x: rect.maxX - 42, y: rect.minY + 31,
                               width: 28, height: 34), radius: 5,
                        fill: .white, stroke: Palette.ink, width: 1.1)
        }
        drawText("\(start) \(operation) 1",
                 in: NSRect(x: rect.minX + 8, y: rect.maxY - 25,
                            width: rect.width - 16, height: 18),
                 size: rect.height > 105 ? 10.5 : 9.5,
                 bold: true, color: stroke, alignment: .center)
    }

    func drawOneLookCard(_ rect: NSRect, count: Int, index: Int,
                         fill: NSColor = .white, stroke: NSColor = Palette.line) {
        roundedRect(rect, radius: 10, fill: fill, stroke: stroke, width: 1)
        drawText("\(index)", in: NSRect(x: rect.minX + 7, y: rect.minY + 6,
                                        width: 18, height: 17),
                 size: 8.5, bold: true, color: Palette.muted)
        drawQuantity(in: NSRect(x: rect.minX + 9, y: rect.minY + 18,
                                width: rect.width - 48, height: rect.height - 29),
                     count: count, variant: index, kind: index % 4,
                     color: [Palette.blue, Palette.coral, Palette.green][index % 3],
                     radius: rect.height > 80 ? 5.2 : 4)
        roundedRect(NSRect(x: rect.maxX - 31, y: rect.minY + 23,
                           width: 21, height: 28), radius: 4,
                    fill: .white, stroke: Palette.ink, width: 1)
    }

    func drawPageOne() {
        drawHeader(
            title: "하나 더, 하나 빼기",
            subtitle: "한 칸만 움직이면 다음 수와 이전 수를 바로 알 수 있어요.",
            page: 1, accent: Palette.blue, light: Palette.blueLight)

        sectionLabel("1", "그림으로 하나 더, 하나 빼기를 봐요", y: 116, color: Palette.blue)
        let concept: [(Int, String, Int)] = [(3, "+", 4), (4, "+", 5), (4, "-", 3), (2, "-", 1)]
        for i in 0..<4 {
            let x = 29 + CGFloat(i) * 136
            drawChangeCard(
                NSRect(x: x, y: 151, width: 126, height: 115),
                start: concept[i].0, operation: concept[i].1, result: concept[i].2,
                index: i + 1,
                fill: i % 2 == 0 ? Palette.blueLight : .white,
                stroke: Palette.blue, answer: false)
        }

        roundedRect(NSRect(x: 45, y: 280, width: 505, height: 47), radius: 14,
                    fill: Palette.yellowLight, stroke: Palette.yellow, width: 1.2)
        drawText("하나 더하면 오른쪽 한 칸, 하나 빼면 왼쪽 한 칸이에요.",
                 in: NSRect(x: 61, y: 294, width: 473, height: 23),
                 size: 13.5, bold: true, alignment: .center)

        sectionLabel("2", "수직선에서 한 칸 움직여요", y: 349, color: Palette.green)
        let lines: [(Int, Int, String)] = [(3, 4, "+"), (4, 3, "-")]
        for i in 0..<2 {
            let y = 389 + CGFloat(i) * 76
            roundedRect(NSRect(x: 34, y: y, width: 527, height: 64), radius: 11,
                        fill: i == 0 ? Palette.greenLight : .white,
                        stroke: Palette.green, width: 1.1)
            drawNumberLine(
                in: NSRect(x: 125, y: y + 7, width: 408, height: 50),
                start: lines[i].0, target: lines[i].1,
                operation: lines[i].2, accent: Palette.green)
        }
        drawText("더하기와 빼기는 수직선에서 딱 한 칸만 달라요.",
                 in: NSRect(x: 38, y: 541, width: 520, height: 21),
                 size: 11.5, bold: true, color: Palette.green, alignment: .center)

        sectionLabel("3", "그림을 보고, 식의 결과를 써요", y: 574, color: Palette.coral)
        let miniOps: [(Int, String)] = [(2, "+"), (3, "+"), (4, "+"), (2, "-"), (4, "-")]
        for i in 0..<5 {
            let x = 29 + CGFloat(i) * 108
            drawChangeCard(
                NSRect(x: x, y: 612, width: 99, height: 112),
                start: miniOps[i].0, operation: miniOps[i].1, result: nil,
                index: i + 1, fill: Palette.coralLight,
                stroke: Palette.coral, answer: true, compact: true)
        }
        drawFooter("천천히 해도 괜찮아요. 하나 더인지, 하나 빼기인지 먼저 찾아보세요.")
    }

    func drawPageTwo() {
        drawHeader(
            title: "같이 풀어요",
            subtitle: "어른과 함께 시작 수를 보고, 한 칸 움직인 결과를 말해요.",
            page: 2, accent: Palette.green, light: Palette.greenLight)

        sectionLabel("1", "시작 수를 보고, 하나 더하거나 하나 빼요", y: 116, color: Palette.green)
        let guided: [(Int, String)] = [(2, "+"), (3, "+"), (4, "+"),
                                       (2, "-"), (3, "-"), (5, "-")]
        for idx in 0..<6 {
            let x = 30 + CGFloat(idx % 3) * 180
            let y = 151 + CGFloat(idx / 3) * 112
            drawChangeCard(
                NSRect(x: x, y: y, width: 166, height: 98),
                start: guided[idx].0, operation: guided[idx].1, result: nil,
                index: idx + 1,
                fill: idx % 2 == 0 ? Palette.greenLight : .white,
                stroke: Palette.green, answer: true)
        }
        drawText("도움말: “지금 수에서 하나 더면 다음 수, 하나 빼면 이전 수야.”",
                 in: NSRect(x: 34, y: 369, width: 520, height: 21),
                 size: 11.5, bold: true, color: Palette.green, alignment: .center)

        sectionLabel("2", "수직선에서 같이 찾아요", y: 402, color: Palette.purple)
        let guidedLines: [(Int, Int, String)] = [
            (3, 4, "+"), (4, 3, "-"), (2, 3, "+"), (5, 4, "-")
        ]
        for i in 0..<4 {
            let y = 444 + CGFloat(i) * 47
            roundedRect(NSRect(x: 35, y: y, width: 370, height: 39), radius: 9,
                        fill: .white, stroke: Palette.purple, width: 1)
            drawNumberLine(
                in: NSRect(x: 73, y: y + 3, width: 278, height: 32),
                start: guidedLines[i].0, target: guidedLines[i].1,
                operation: guidedLines[i].2, accent: Palette.purple)
            roundedRect(NSRect(x: 364, y: y + 6, width: 28, height: 27),
                        radius: 4, fill: .white, stroke: Palette.ink, width: 1)
        }
        roundedRect(NSRect(x: 445, y: 456, width: 112, height: 160), radius: 12,
                    fill: Palette.yellowLight, stroke: Palette.yellow, width: 1.1)
        drawText("이렇게 말해요", in: NSRect(x: 456, y: 469, width: 90, height: 22),
                 size: 13, bold: true, color: Palette.ink, alignment: .center)
        drawText("“어디에서\n시작할까?”\n\n“한 칸만\n움직여 보자.”",
                 in: NSRect(x: 458, y: 505, width: 86, height: 96),
                 size: 11.5, color: Palette.muted, alignment: .center, lineSpacing: 3)

        sectionLabel("3", "전날 복습: 1~5를 딱 보고 말해요", y: 660, color: Palette.coral)
        let counts = [3, 1, 5, 2, 4]
        for i in 0..<5 {
            let x = 30 + CGFloat(i) * 108
            drawOneLookCard(
                NSRect(x: x, y: 700, width: 98, height: 78),
                count: counts[i], index: i + 1,
                fill: i % 2 == 0 ? Palette.coralLight : .white,
                stroke: Palette.coral)
        }
        drawFooter("정답을 말한 뒤, 하나씩 다시 세었는지도 가볍게 표시해 주세요.")
    }

    func drawPageThree() {
        drawHeader(
            title: "혼자 해 봐요",
            subtitle: "그림, 모양, 방향을 바꾸어도 +1과 -1을 찾아요.",
            page: 3, accent: Palette.purple, light: Palette.purpleLight)

        sectionLabel("1", "그림을 보고, +1 또는 -1의 결과를 써요", y: 116, color: Palette.purple)
        let solo: [(Int, String)] = [
            (1, "+"), (2, "+"), (3, "+"), (4, "+"), (2, "+"),
            (1, "+"), (2, "+"), (3, "+"), (4, "+"), (2, "+"),
            (2, "-"), (3, "-"), (4, "-"), (5, "-"), (3, "-"),
            (2, "-"), (3, "-"), (4, "-"), (5, "-"), (4, "-")
        ]
        for idx in 0..<20 {
            let col = idx % 5
            let row = idx / 5
            let x = 29 + CGFloat(col) * 108
            let y = 151 + CGFloat(row) * 112
            drawChangeCard(
                NSRect(x: x, y: y, width: 99, height: 99),
                start: solo[idx].0, operation: solo[idx].1, result: nil,
                index: idx + 1,
                fill: (row + col) % 2 == 0 ? Palette.purpleLight : .white,
                stroke: Palette.line, answer: true, compact: true)
        }

        sectionLabel("2", "식의 결과만큼 동그라미를 색칠해요", y: 620, color: Palette.blue)
        let colorOps: [(Int, String)] = [(2, "+"), (4, "-"), (3, "+"), (5, "-"), (1, "+")]
        for i in 0..<5 {
            let x = 29 + CGFloat(i) * 108
            roundedRect(NSRect(x: x, y: 658, width: 99, height: 124), radius: 11,
                        fill: Palette.blueLight, stroke: Palette.blue, width: 1.1)
            drawText("\(colorOps[i].0) \(colorOps[i].1) 1",
                     in: NSRect(x: x, y: 668, width: 99, height: 24),
                     size: 16, bold: true, color: Palette.blue, alignment: .center)
            for j in 0..<5 {
                circle(center: NSPoint(x: x + 17 + CGFloat(j % 3) * 32,
                                       y: 721 + CGFloat(j / 3) * 30),
                       radius: 9, fill: .white, stroke: Palette.ink, width: 1)
            }
        }
        drawFooter("다 푼 뒤, 다시 센 문제와 손가락을 쓴 문제에 작은 별표를 해 두세요.")
    }

    func drawApplicationCard(_ rect: NSRect, start: Int, operation: String, index: Int) {
        roundedRect(rect, radius: 9,
                    fill: index % 2 == 0 ? Palette.greenLight : .white,
                    stroke: Palette.green, width: 1)
        drawQuantity(
            in: NSRect(x: rect.minX + 10, y: rect.minY + 7, width: 42, height: 36),
            count: start, variant: index, kind: index % 4,
            color: index % 2 == 0 ? Palette.green : Palette.blue, radius: 4)
        drawText("\(operation)1", in: NSRect(x: rect.minX + 55, y: rect.minY + 14,
                                             width: 36, height: 22),
                 size: 13, bold: true, color: Palette.ink, alignment: .center)
        drawText("→", in: NSRect(x: rect.minX + 91, y: rect.minY + 14,
                                 width: 22, height: 22),
                 size: 14, bold: true, color: Palette.muted, alignment: .center)
        roundedRect(NSRect(x: rect.minX + 121, y: rect.minY + 10,
                           width: 27, height: 29), radius: 4,
                    fill: .white, stroke: Palette.ink, width: 1)
        drawText(operation == "+" ? "하나 더" : "하나 빼기",
                 in: NSRect(x: rect.minX + 155, y: rect.minY + 14,
                            width: rect.width - 164, height: 20),
                 size: 9.2, bold: true, color: Palette.muted)
    }

    func drawPageFour() {
        drawHeader(
            title: "누적 복습 + 응용",
            subtitle: "지난 수량 복습과 오늘의 한 칸 움직이기를 함께 해 봐요.",
            page: 4, accent: Palette.coral, light: Palette.coralLight)

        sectionLabel("1", "지난 연습 복습: 3개와 1개는 모두 4", y: 116, color: Palette.coral)
        let reviewPairs: [(Int, Int)] = [(3, 1), (1, 3), (3, 1), (1, 3), (3, 1)]
        for i in 0..<5 {
            let y = 151 + CGFloat(i) * 50
            roundedRect(NSRect(x: 40, y: y, width: 205, height: 39), radius: 9,
                        fill: i % 2 == 0 ? Palette.coralLight : .white,
                        stroke: Palette.coral, width: 1)
            drawSplitQuantity(
                in: NSRect(x: 56, y: y + 3, width: 166, height: 33),
                left: reviewPairs[i].0, right: reviewPairs[i].1, variant: i + 2,
                leftKind: i % 4, rightKind: (i + 1) % 4,
                leftColor: Palette.coral, rightColor: Palette.blue, radius: 4.4)
            for (choiceIndex, number) in [3, 4, 5].enumerated() {
                optionBubble(number: number,
                             center: NSPoint(x: 340 + CGFloat(choiceIndex) * 74,
                                             y: y + 19.5),
                             radius: 16, color: Palette.coral)
            }
        }

        sectionLabel("2", "1~5를 한눈에 보고, 빈칸에 써요", y: 412, color: Palette.blue)
        let reviewCounts = [2, 5, 3, 1, 4]
        for i in 0..<5 {
            let x = 29 + CGFloat(i) * 108
            drawOneLookCard(
                NSRect(x: x, y: 451, width: 99, height: 78),
                count: reviewCounts[i], index: i + 1,
                fill: Palette.blueLight, stroke: Palette.blue)
        }

        sectionLabel("3", "생활 속에서도 하나 더, 하나 빼기", y: 563, color: Palette.green)
        let applications: [(Int, String)] = [
            (3, "+"), (4, "-"), (2, "+"),
            (5, "-"), (3, "+"), (2, "-")
        ]
        for i in 0..<6 {
            let col = i % 2
            let row = i / 2
            let x = 33 + CGFloat(col) * 275
            let y = 604 + CGFloat(row) * 58
            drawApplicationCard(
                NSRect(x: x, y: y, width: 254, height: 51),
                start: applications[i].0, operation: applications[i].1, index: i)
        }

        drawFooter("잘한 방법을 골라 보세요: 바로 알기, 수직선 한 칸, 손가락 사용하기 모두 괜찮아요.")
    }
}

final class TeacherPage: NSView {
    let pageNumber: Int

    init(page: Int) {
        pageNumber = page
        super.init(frame: NSRect(origin: .zero, size: pageSize))
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override var isFlipped: Bool { true }

    override func draw(_ dirtyRect: NSRect) {
        Palette.paper.setFill()
        bounds.fill()
        drawTeacherHeader()
        pageNumber == 1 ? drawAnswersOneTwo() : drawAnswersThreeFour()
    }

    func drawTeacherHeader() {
        roundedRect(NSRect(x: 24, y: 20, width: 547, height: 72), radius: 16,
                    fill: Palette.yellowLight, stroke: Palette.yellow, width: 1.8)
        drawText("DAY 2  교사용 정답 · 관찰 안내",
                 in: NSRect(x: 43, y: 35, width: 430, height: 30),
                 size: 21, bold: true)
        drawText("아이에게 주는 4쪽과 분리해서 사용하세요.",
                 in: NSRect(x: 44, y: 66, width: 400, height: 18),
                 size: 10.5, color: Palette.muted)
        drawText("\(pageNumber) / 2",
                 in: NSRect(x: 510, y: 60, width: 37, height: 18),
                 size: 9.5, color: Palette.muted, alignment: .right)
    }

    func answerBox(title: String, body: String, rect: NSRect,
                   accent: NSColor, light: NSColor) {
        roundedRect(rect, radius: 13, fill: light, stroke: accent, width: 1.2)
        drawText(title, in: NSRect(x: rect.minX + 16, y: rect.minY + 13,
                                   width: rect.width - 32, height: 25),
                 size: 16, bold: true, color: accent)
        drawText(body, in: NSRect(x: rect.minX + 17, y: rect.minY + 47,
                                  width: rect.width - 34, height: rect.height - 57),
                 size: 11.3, color: Palette.ink, lineSpacing: 3)
    }

    func drawAnswersOneTwo() {
        drawText("정답", in: NSRect(x: 28, y: 112, width: 200, height: 30),
                 size: 22, bold: true)
        drawText("아이의 말과 전략도 함께 기록해 주세요.",
                 in: NSRect(x: 365, y: 117, width: 200, height: 20),
                 size: 10, color: Palette.muted, alignment: .right)

        answerBox(
            title: "1쪽 · 오늘의 개념",
            body: "1번: 3+1=4, 4+1=5, 4-1=3, 2-1=1\n" +
                 "2번: 3+1은 3에서 4로, 4-1은 4에서 3으로 한 칸 이동\n" +
                 "3번: 2+1=3, 3+1=4, 4+1=5, 2-1=1, 4-1=3\n\n" +
                 "관찰: 식을 보자마자 시작 수에서 한 칸 움직였는지 확인합니다.",
            rect: NSRect(x: 28, y: 151, width: 539, height: 166),
            accent: Palette.blue, light: Palette.blueLight)

        answerBox(
            title: "2쪽 · 같이 풀기",
            body: "1번: 3, 4, 5, 1, 2, 4\n" +
                 "2번: 4, 3, 3, 4\n" +
                 "3번: 3, 1, 5, 2, 4\n\n" +
                 "질문: “어디에서 시작할까?”, “한 칸만 움직여 보자.”\n" +
                 "손가락을 사용했는지보다 1부터 다시 세었는지를 봅니다.",
            rect: NSRect(x: 28, y: 335, width: 539, height: 174),
            accent: Palette.green, light: Palette.greenLight)

        answerBox(
            title: "관찰 메모",
            body: "바로 말한 문제: 약                         개\n" +
                 "1부터 다시 센 문제: 약                         개\n" +
                 "손가락을 사용한 문제: 약                         개\n" +
                 "어려웠던 방향: +1 / -1 / 둘 다\n" +
                 "아이의 말: ________________________________________________\n" +
                 "____________________________________________________________",
            rect: NSRect(x: 28, y: 527, width: 539, height: 238),
            accent: Palette.purple, light: Palette.purpleLight)
    }

    func drawAnswersThreeFour() {
        drawText("정답과 다음 기록", in: NSRect(x: 28, y: 112, width: 300, height: 30),
                 size: 22, bold: true)

        answerBox(
            title: "3쪽 · 혼자 연습",
            body: "1~10: 2, 3, 4, 5, 3 / 2, 3, 4, 5, 3\n" +
                 "11~20: 1, 2, 3, 4, 2 / 1, 2, 3, 4, 3\n" +
                 "2번: 2+1=3, 4-1=3, 3+1=4, 5-1=4, 1+1=2\n\n" +
                 "관찰: +와 -를 혼동했는지, 시작 수에서 바로 출발했는지 표시합니다.",
            rect: NSRect(x: 28, y: 151, width: 539, height: 157),
            accent: Palette.purple, light: Palette.purpleLight)

        answerBox(
            title: "4쪽 · 누적 복습 + 응용",
            body: "1번: 모두 4\n" +
                 "2번: 2, 5, 3, 1, 4\n" +
                 "3번: 3+1=4, 4-1=3, 2+1=3, 5-1=4, 3+1=4, 2-1=1\n\n" +
                 "3+1/1+3을 하나씩 세지 않고 4로 바로 말했는지도 기록합니다.",
            rect: NSRect(x: 28, y: 326, width: 539, height: 153),
            accent: Palette.coral, light: Palette.coralLight)

        drawText("보호자가 사용할 말", in: NSRect(x: 28, y: 510, width: 300, height: 28),
                 size: 19, bold: true)
        let phrases = [
            "지금 몇에서 시작할까?",
            "하나 더면 어느 쪽으로 한 칸 갈까?",
            "하나 빼면 다음 수일까, 이전 수일까?",
            "1부터 다시 세지 말고, 알고 있는 수에서 출발해 볼까?",
            "손가락을 써도 괜찮아. 더 편한 방법도 찾아보자."
        ]
        for (i, phrase) in phrases.enumerated() {
            let y = 551 + CGFloat(i) * 38
            circle(center: NSPoint(x: 44, y: y + 12), radius: 11,
                   fill: Palette.green, stroke: Palette.green)
            drawText("\(i + 1)", in: NSRect(x: 33, y: y + 2, width: 22, height: 20),
                     size: 11, bold: true, color: .white, alignment: .center)
            drawText(phrase, in: NSRect(x: 65, y: y, width: 490, height: 28),
                     size: 12.3)
        }
        roundedRect(NSRect(x: 28, y: 761, width: 539, height: 53), radius: 9,
                    fill: Palette.yellowLight, stroke: Palette.yellow, width: 1)
        drawText("시간 제한은 두지 않습니다. 정확성과 전략이 먼저예요.",
                 in: NSRect(x: 42, y: 779, width: 511, height: 20),
                 size: 11, bold: true, color: Palette.muted, alignment: .center)
    }
}

func makePDF(views: [NSView], destination: URL) throws {
    let document = PDFDocument()
    for (index, view) in views.enumerated() {
        view.layoutSubtreeIfNeeded()
        let data = view.dataWithPDF(inside: view.bounds)
        guard let onePage = PDFDocument(data: data), let page = onePage.page(at: 0) else {
            throw NSError(domain: "Worksheet", code: 1,
                          userInfo: [NSLocalizedDescriptionKey: "PDF page creation failed"])
        }
        document.insert(page, at: index)
    }
    guard document.write(to: destination) else {
        throw NSError(domain: "Worksheet", code: 2,
                      userInfo: [NSLocalizedDescriptionKey: "PDF write failed"])
    }
}

func renderPreviews(documentURL: URL, prefix: String) throws {
    guard let document = PDFDocument(url: documentURL) else { return }
    for i in 0..<document.pageCount {
        guard let page = document.page(at: i) else { continue }
        let bounds = page.bounds(for: .mediaBox)
        let scale: CGFloat = 1.4
        let width = Int(bounds.width * scale)
        let height = Int(bounds.height * scale)
        guard let rep = NSBitmapImageRep(
            bitmapDataPlanes: nil, pixelsWide: width, pixelsHigh: height,
            bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true,
            isPlanar: false, colorSpaceName: .deviceRGB,
            bytesPerRow: 0, bitsPerPixel: 0) else { continue }
        NSGraphicsContext.saveGraphicsState()
        guard let context = NSGraphicsContext(bitmapImageRep: rep) else { continue }
        NSGraphicsContext.current = context
        NSColor.white.setFill()
        NSRect(x: 0, y: 0, width: width, height: height).fill()
        context.cgContext.scaleBy(x: scale, y: scale)
        page.draw(with: .mediaBox, to: context.cgContext)
        NSGraphicsContext.restoreGraphicsState()
        if let png = rep.representation(using: .png, properties: [:]) {
            try png.write(to: previewDirectory.appendingPathComponent("\(prefix)_\(i + 1).png"))
        }
    }
}

let childURL = outputDirectory.appendingPathComponent("DAY2_+1-1_하나더하나빼기_학습지.pdf")
try makePDF(views: (1...4).map { ChildPage(page: $0) }, destination: childURL)
try renderPreviews(documentURL: childURL, prefix: "preview_child")
let teacherURL = outputDirectory.appendingPathComponent("DAY2_교사용_정답과_관찰안내.pdf")
try makePDF(views: (1...2).map { TeacherPage(page: $0) }, destination: teacherURL)
try renderPreviews(documentURL: teacherURL, prefix: "preview_teacher")
print(childURL.path)
print(teacherURL.path)
