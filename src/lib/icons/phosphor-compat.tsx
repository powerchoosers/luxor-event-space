'use client'

import React, { forwardRef } from 'react'
import type { Icon, IconProps, IconWeight } from '@phosphor-icons/react'
import {
  Archive as P_Archive,
  Armchair as P_Armchair,
  ArrowBendUpLeft as P_ArrowBendUpLeft,
  ArrowClockwise as P_ArrowClockwise,
  ArrowCounterClockwise as P_ArrowCounterClockwise,
  ArrowDown as P_ArrowDown,
  ArrowDownRight as P_ArrowDownRight,
  ArrowLeft as P_ArrowLeft,
  ArrowRight as P_ArrowRight,
  ArrowSquareOut as P_ArrowSquareOut,
  ArrowUp as P_ArrowUp,
  ArrowUpRight as P_ArrowUpRight,
  ArrowsIn as P_ArrowsIn,
  ArrowsLeftRight as P_ArrowsLeftRight,
  ArrowsOut as P_ArrowsOut,
  ArrowsOutCardinal as P_ArrowsOutCardinal,
  ArrowsVertical as P_ArrowsVertical,
  Baby as P_Baby,
  Backspace as P_Backspace,
  Bell as P_Bell,
  BellRinging as P_BellRinging,
  BellSlash as P_BellSlash,
  BookOpen as P_BookOpen,
  BookmarkSimple as P_BookmarkSimple,
  Brain as P_Brain,
  Briefcase as P_Briefcase,
  Broadcast as P_Broadcast,
  Browsers as P_Browsers,
  Buildings as P_Buildings,
  Cake as P_Cake,
  Calendar as P_Calendar,
  CalendarCheck as P_CalendarCheck,
  CalendarDots as P_CalendarDots,
  CalendarPlus as P_CalendarPlus,
  CalendarX as P_CalendarX,
  Camera as P_Camera,
  CaretDown as P_CaretDown,
  CaretLeft as P_CaretLeft,
  CaretRight as P_CaretRight,
  CaretUp as P_CaretUp,
  ChartBar as P_ChartBar,
  Chat as P_Chat,
  ChatCircle as P_ChatCircle,
  ChatCircleDots as P_ChatCircleDots,
  ChatText as P_ChatText,
  Check as P_Check,
  CheckCircle as P_CheckCircle,
  CheckSquare as P_CheckSquare,
  Checks as P_Checks,
  Circle as P_Circle,
  CircleDashed as P_CircleDashed,
  ClipboardText as P_ClipboardText,
  Clock as P_Clock,
  ClockCounterClockwise as P_ClockCounterClockwise,
  Columns as P_Columns,
  Compass as P_Compass,
  Confetti as P_Confetti,
  Copy as P_Copy,
  Cpu as P_Cpu,
  CreditCard as P_CreditCard,
  CurrencyCircleDollar as P_CurrencyCircleDollar,
  CurrencyDollar as P_CurrencyDollar,
  CursorClick as P_CursorClick,
  Database as P_Database,
  DeviceMobile as P_DeviceMobile,
  DeviceTablet as P_DeviceTablet,
  DoorOpen as P_DoorOpen,
  DotsSixVertical as P_DotsSixVertical,
  DotsThree as P_DotsThree,
  DotsThreeVertical as P_DotsThreeVertical,
  DownloadSimple as P_DownloadSimple,
  Drop as P_Drop,
  Envelope as P_Envelope,
  EnvelopeSimple as P_EnvelopeSimple,
  Eye as P_Eye,
  FileArrowUp as P_FileArrowUp,
  FileText as P_FileText,
  Flame as P_Flame,
  Flask as P_Flask,
  FloppyDisk as P_FloppyDisk,
  Folder as P_Folder,
  FolderOpen as P_FolderOpen,
  ForkKnife as P_ForkKnife,
  Gear as P_Gear,
  GearSix as P_GearSix,
  GitBranch as P_GitBranch,
  Globe as P_Globe,
  GridFour as P_GridFour,
  Handshake as P_Handshake,
  Heart as P_Heart,
  Image as P_Image,
  Info as P_Info,
  Key as P_Key,
  Lamp as P_Lamp,
  Laptop as P_Laptop,
  Layout as P_Layout,
  Lightning as P_Lightning,
  Link as P_Link,
  LinkSimple as P_LinkSimple,
  List as P_List,
  ListChecks as P_ListChecks,
  ListDashes as P_ListDashes,
  ListPlus as P_ListPlus,
  Lock as P_Lock,
  LockKey as P_LockKey,
  MagnifyingGlass as P_MagnifyingGlass,
  MagnifyingGlassMinus as P_MagnifyingGlassMinus,
  MagnifyingGlassPlus as P_MagnifyingGlassPlus,
  MapPin as P_MapPin,
  MegaphoneSimple as P_MegaphoneSimple,
  Microphone as P_Microphone,
  MicrophoneSlash as P_MicrophoneSlash,
  Minus as P_Minus,
  Monitor as P_Monitor,
  Moon as P_Moon,
  MusicNotes as P_MusicNotes,
  NotePencil as P_NotePencil,
  Package as P_Package,
  Palette as P_Palette,
  PaperPlaneTilt as P_PaperPlaneTilt,
  Paperclip as P_Paperclip,
  Pause as P_Pause,
  PencilSimple as P_PencilSimple,
  Phone as P_Phone,
  PhoneCall as P_PhoneCall,
  PhoneDisconnect as P_PhoneDisconnect,
  PhoneIncoming as P_PhoneIncoming,
  PhoneOutgoing as P_PhoneOutgoing,
  PhoneSlash as P_PhoneSlash,
  Play as P_Play,
  Plugs as P_Plugs,
  Plus as P_Plus,
  Printer as P_Printer,
  Prohibit as P_Prohibit,
  Pulse as P_Pulse,
  QrCode as P_QrCode,
  Question as P_Question,
  Receipt as P_Receipt,
  Rectangle as P_Rectangle,
  Robot as P_Robot,
  Ruler as P_Ruler,
  SealCheck as P_SealCheck,
  ShareNetwork as P_ShareNetwork,
  ShieldCheck as P_ShieldCheck,
  ShieldWarning as P_ShieldWarning,
  SidebarSimple as P_SidebarSimple,
  SignOut as P_SignOut,
  Signature as P_Signature,
  Sliders as P_Sliders,
  SlidersHorizontal as P_SlidersHorizontal,
  Sparkle as P_Sparkle,
  SpeakerHigh as P_SpeakerHigh,
  SpeakerSimpleSlash as P_SpeakerSimpleSlash,
  SpinnerGap as P_SpinnerGap,
  SquaresFour as P_SquaresFour,
  Stack as P_Stack,
  Star as P_Star,
  Sun as P_Sun,
  Tag as P_Tag,
  TagSimple as P_TagSimple,
  TextAlignCenter as P_TextAlignCenter,
  TextAlignLeft as P_TextAlignLeft,
  TextAlignRight as P_TextAlignRight,
  TextB as P_TextB,
  TextHOne as P_TextHOne,
  TextItalic as P_TextItalic,
  TextT as P_TextT,
  TextUnderline as P_TextUnderline,
  ThumbsUp as P_ThumbsUp,
  Translate as P_Translate,
  Trash as P_Trash,
  Tray as P_Tray,
  TreeStructure as P_TreeStructure,
  TrendDown as P_TrendDown,
  TrendUp as P_TrendUp,
  UploadSimple as P_UploadSimple,
  User as P_User,
  UserCheck as P_UserCheck,
  UserCircle as P_UserCircle,
  UserCircleCheck as P_UserCircleCheck,
  UserMinus as P_UserMinus,
  UserPlus as P_UserPlus,
  Users as P_Users,
  VideoCamera as P_VideoCamera,
  Voicemail as P_Voicemail,
  Wallet as P_Wallet,
  Warning as P_Warning,
  WarningCircle as P_WarningCircle,
  Wrench as P_Wrench,
  X as P_X,
  XCircle as P_XCircle,
} from '@phosphor-icons/react'

export interface LucideProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string
  strokeWidth?: number | string
  absoluteStrokeWidth?: boolean
  color?: string
  weight?: IconWeight
}

export type LucideIcon = React.ForwardRefExoticComponent<
  LucideProps & React.RefAttributes<SVGSVGElement>
>

function adapt(Component: Icon): LucideIcon {
  return forwardRef<SVGSVGElement, LucideProps>(function LucidePhosphorCompat(
    {
      size = 24,
      strokeWidth,
      color,
      weight: requestedWeight,
      className = '',
      absoluteStrokeWidth: _asw,
      ...props
    },
    ref
  ) {
    void _asw
    const numStroke = typeof strokeWidth === 'string' ? parseFloat(strokeWidth) : strokeWidth
    const isFill = requestedWeight === 'fill' || className.includes('fill-current') || className.includes('fill-white')
    const weight: IconWeight =
      requestedWeight ||
      (isFill
        ? 'fill'
        : numStroke != null && numStroke <= 1.25
        ? 'light'
        : numStroke != null && numStroke >= 2.5
        ? 'bold'
        : 'regular')

    return (
      <Component
        ref={ref}
        size={size}
        color={color}
        weight={weight}
        className={`inline-block shrink-0 align-middle ${className}`.trim()}
        {...props}
      />
    )
  })
}

// Export Lucide names adapted from Phosphor icons
export const Activity = adapt(P_Pulse)
export const AlertCircle = adapt(P_WarningCircle)
export const AlertTriangle = adapt(P_Warning)
export const AlignCenter = adapt(P_TextAlignCenter)
export const AlignLeft = adapt(P_TextAlignLeft)
export const AlignRight = adapt(P_TextAlignRight)
export const Archive = adapt(P_Archive)
export const Armchair = adapt(P_Armchair)
export const ArrowDown = adapt(P_ArrowDown)
export const ArrowDownRight = adapt(P_ArrowDownRight)
export const ArrowLeft = adapt(P_ArrowLeft)
export const ArrowRight = adapt(P_ArrowRight)
export const ArrowRightLeft = adapt(P_ArrowsLeftRight)
export const ArrowUp = adapt(P_ArrowUp)
export const ArrowUpRight = adapt(P_ArrowUpRight)
export const Baby = adapt(P_Baby)
export const BadgeCheck = adapt(P_SealCheck)
export const BadgeDollarSign = adapt(P_CurrencyCircleDollar)
export const Ban = adapt(P_Prohibit)
export const BarChart3 = adapt(P_ChartBar)
export const Bell = adapt(P_Bell)
export const BellOff = adapt(P_BellSlash)
export const BellRing = adapt(P_BellRinging)
export const Bold = adapt(P_TextB)
export const BookOpen = adapt(P_BookOpen)
export const BookmarkCheck = adapt(P_BookmarkSimple)
export const Bot = adapt(P_Robot)
export const BrainCircuit = adapt(P_Brain)
export const Briefcase = adapt(P_Briefcase)
export const Building = adapt(P_Buildings)
export const Building2 = adapt(P_Buildings)
export const Cake = adapt(P_Cake)
export const Calendar = adapt(P_Calendar)
export const CalendarCheck = adapt(P_CalendarCheck)
export const CalendarCheck2 = adapt(P_CalendarCheck)
export const CalendarClock = adapt(P_CalendarDots)
export const CalendarDays = adapt(P_CalendarDots)
export const CalendarPlus = adapt(P_CalendarPlus)
export const CalendarX2 = adapt(P_CalendarX)
export const Camera = adapt(P_Camera)
export const Check = adapt(P_Check)
export const CheckCheck = adapt(P_Checks)
export const CheckCircle = adapt(P_CheckCircle)
export const CheckCircle2 = adapt(P_CheckCircle)
export const CheckSquare = adapt(P_CheckSquare)
export const ChevronDown = adapt(P_CaretDown)
export const ChevronLeft = adapt(P_CaretLeft)
export const ChevronRight = adapt(P_CaretRight)
export const ChevronUp = adapt(P_CaretUp)
export const Circle = adapt(P_Circle)
export const CircleAlert = adapt(P_WarningCircle)
export const CircleDollarSign = adapt(P_CurrencyCircleDollar)
export const CircleDot = adapt(P_CircleDashed)
export const ClipboardCheck = adapt(P_ClipboardText)
export const ClipboardList = adapt(P_ClipboardText)
export const Clock = adapt(P_Clock)
export const Clock3 = adapt(P_Clock)
export const Columns2 = adapt(P_Columns)
export const Compass = adapt(P_Compass)
export const Copy = adapt(P_Copy)
export const Cpu = adapt(P_Cpu)
export const CreditCard = adapt(P_CreditCard)
export const Database = adapt(P_Database)
export const Delete = adapt(P_Backspace)
export const DollarSign = adapt(P_CurrencyDollar)
export const DoorOpen = adapt(P_DoorOpen)
export const Download = adapt(P_DownloadSimple)
export const Droplet = adapt(P_Drop)
export const Edit2 = adapt(P_PencilSimple)
export const Edit3 = adapt(P_PencilSimple)
export const ExternalLink = adapt(P_ArrowSquareOut)
export const Eye = adapt(P_Eye)
export const FileCheck = adapt(P_FileText)
export const FileCheck2 = adapt(P_FileText)
export const FilePenLine = adapt(P_NotePencil)
export const FileSignature = adapt(P_Signature)
export const FileText = adapt(P_FileText)
export const FileUp = adapt(P_FileArrowUp)
export const Flame = adapt(P_Flame)
export const FlaskConical = adapt(P_Flask)
export const Folder = adapt(P_Folder)
export const FolderClosed = adapt(P_Folder)
export const FolderOpen = adapt(P_FolderOpen)
export const GitBranch = adapt(P_GitBranch)
export const Globe = adapt(P_Globe)
export const Grid = adapt(P_SquaresFour)
export const Grid2X2 = adapt(P_SquaresFour)
export const GripVertical = adapt(P_DotsSixVertical)
export const Handshake = adapt(P_Handshake)
export const Heading1 = adapt(P_TextHOne)
export const Heart = adapt(P_Heart)
export const HelpCircle = adapt(P_Question)
export const History = adapt(P_ClockCounterClockwise)
export const Image = adapt(P_Image)
export const Images = adapt(P_Image)
export const Inbox = adapt(P_Tray)
export const Info = adapt(P_Info)
export const Italic = adapt(P_TextItalic)
export const KeyRound = adapt(P_Key)
export const LampDesk = adapt(P_Lamp)
export const Languages = adapt(P_Translate)
export const Laptop = adapt(P_Laptop)
export const Layers = adapt(P_Stack)
export const Layers3 = adapt(P_Stack)
export const LayoutDashboard = adapt(P_SquaresFour)
export const LayoutGrid = adapt(P_GridFour)
export const LayoutTemplate = adapt(P_Browsers)
export const Link = adapt(P_Link)
export const Link2 = adapt(P_LinkSimple)
export const List = adapt(P_List)
export const ListMinus = adapt(P_ListDashes)
export const ListPlus = adapt(P_ListPlus)
export const ListTodo = adapt(P_ListChecks)
export const Loader2 = adapt(P_SpinnerGap)
export const LoaderCircle = adapt(P_SpinnerGap)
export const Lock = adapt(P_Lock)
export const LockKeyhole = adapt(P_LockKey)
export const LogOut = adapt(P_SignOut)
export const Mail = adapt(P_Envelope)
export const MailPlus = adapt(P_EnvelopeSimple)
export const MapPin = adapt(P_MapPin)
export const Maximize2 = adapt(P_ArrowsOut)
export const Megaphone = adapt(P_MegaphoneSimple)
export const Menu = adapt(P_List)
export const MessageCircle = adapt(P_ChatCircle)
export const MessageCircleMore = adapt(P_ChatCircleDots)
export const MessageSquare = adapt(P_Chat)
export const MessageSquareText = adapt(P_ChatText)
export const Mic = adapt(P_Microphone)
export const MicOff = adapt(P_MicrophoneSlash)
export const Minimize2 = adapt(P_ArrowsIn)
export const Minus = adapt(P_Minus)
export const Monitor = adapt(P_Monitor)
export const Moon = adapt(P_Moon)
export const MoreHorizontal = adapt(P_DotsThree)
export const MoreVertical = adapt(P_DotsThreeVertical)
export const MousePointerClick = adapt(P_CursorClick)
export const Move = adapt(P_ArrowsOutCardinal)
export const Music = adapt(P_MusicNotes)
export const NotebookPen = adapt(P_NotePencil)
export const Package = adapt(P_Package)
export const PackageCheck = adapt(P_Package)
export const Palette = adapt(P_Palette)
export const PanelBottom = adapt(P_Layout)
export const PanelLeftClose = adapt(P_SidebarSimple)
export const PanelLeftOpen = adapt(P_SidebarSimple)
export const PanelRightClose = adapt(P_SidebarSimple)
export const PanelRightOpen = adapt(P_SidebarSimple)
export const PanelTop = adapt(P_Layout)
export const Paperclip = adapt(P_Paperclip)
export const PartyPopper = adapt(P_Confetti)
export const Pause = adapt(P_Pause)
export const PenLine = adapt(P_PencilSimple)
export const PenSquare = adapt(P_NotePencil)
export const Pencil = adapt(P_PencilSimple)
export const Phone = adapt(P_Phone)
export const PhoneCall = adapt(P_PhoneCall)
export const PhoneIncoming = adapt(P_PhoneIncoming)
export const PhoneMissed = adapt(P_PhoneDisconnect)
export const PhoneOff = adapt(P_PhoneSlash)
export const PhoneOutgoing = adapt(P_PhoneOutgoing)
export const Play = adapt(P_Play)
export const Plus = adapt(P_Plus)
export const Printer = adapt(P_Printer)
export const QrCode = adapt(P_QrCode)
export const Radar = adapt(P_Broadcast)
export const Receipt = adapt(P_Receipt)
export const ReceiptText = adapt(P_Receipt)
export const RectangleHorizontal = adapt(P_Rectangle)
export const Redo2 = adapt(P_ArrowClockwise)
export const RefreshCw = adapt(P_ArrowClockwise)
export const Reply = adapt(P_ArrowBendUpLeft)
export const RotateCcw = adapt(P_ArrowCounterClockwise)
export const RotateCw = adapt(P_ArrowClockwise)
export const Ruler = adapt(P_Ruler)
export const Save = adapt(P_FloppyDisk)
export const Search = adapt(P_MagnifyingGlass)
export const Send = adapt(P_PaperPlaneTilt)
export const Settings = adapt(P_Gear)
export const Settings2 = adapt(P_GearSix)
export const Share2 = adapt(P_ShareNetwork)
export const ShieldAlert = adapt(P_ShieldWarning)
export const ShieldCheck = adapt(P_ShieldCheck)
export const Sliders = adapt(P_Sliders)
export const SlidersHorizontal = adapt(P_SlidersHorizontal)
export const Smartphone = adapt(P_DeviceMobile)
export const Sofa = adapt(P_Armchair)
export const Space = adapt(P_ArrowsVertical)
export const Sparkles = adapt(P_Sparkle)
export const SquarePen = adapt(P_NotePencil)
export const Star = adapt(P_Star)
export const Sun = adapt(P_Sun)
export const Tablet = adapt(P_DeviceTablet)
export const Tag = adapt(P_Tag)
export const Tags = adapt(P_TagSimple)
export const ThumbsUp = adapt(P_ThumbsUp)
export const Trash2 = adapt(P_Trash)
export const TrendingDown = adapt(P_TrendDown)
export const TrendingUp = adapt(P_TrendUp)
export const Type = adapt(P_TextT)
export const Underline = adapt(P_TextUnderline)
export const Undo2 = adapt(P_ArrowCounterClockwise)
export const Unplug = adapt(P_Plugs)
export const Upload = adapt(P_UploadSimple)
export const User = adapt(P_User)
export const UserCheck = adapt(P_UserCheck)
export const UserPlus = adapt(P_UserPlus)
export const UserRound = adapt(P_UserCircle)
export const UserRoundCheck = adapt(P_UserCircleCheck)
export const UserX = adapt(P_UserMinus)
export const Users = adapt(P_Users)
export const Utensils = adapt(P_ForkKnife)
export const Video = adapt(P_VideoCamera)
export const Voicemail = adapt(P_Voicemail)
export const Volume2 = adapt(P_SpeakerHigh)
export const VolumeX = adapt(P_SpeakerSimpleSlash)
export const WalletCards = adapt(P_Wallet)
export const Workflow = adapt(P_TreeStructure)
export const Wrench = adapt(P_Wrench)
export const X = adapt(P_X)
export const XCircle = adapt(P_XCircle)
export const Zap = adapt(P_Lightning)
export const ZoomIn = adapt(P_MagnifyingGlassPlus)
export const ZoomOut = adapt(P_MagnifyingGlassMinus)

export default {
  Activity,
  AlertCircle,
  AlertTriangle,
  AlignCenter,
  AlignLeft,
  AlignRight,
  Archive,
  Armchair,
  ArrowDown,
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  ArrowRightLeft,
  ArrowUp,
  ArrowUpRight,
  Baby,
  BadgeCheck,
  BadgeDollarSign,
  Ban,
  BarChart3,
  Bell,
  BellOff,
  BellRing,
  Bold,
  BookOpen,
  BookmarkCheck,
  Bot,
  BrainCircuit,
  Briefcase,
  Building,
  Building2,
  Cake,
  Calendar,
  CalendarCheck,
  CalendarCheck2,
  CalendarClock,
  CalendarDays,
  CalendarPlus,
  CalendarX2,
  Camera,
  Check,
  CheckCheck,
  CheckCircle,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Circle,
  CircleAlert,
  CircleDollarSign,
  CircleDot,
  ClipboardCheck,
  ClipboardList,
  Clock,
  Clock3,
  Columns2,
  Compass,
  Copy,
  Cpu,
  CreditCard,
  Database,
  Delete,
  DollarSign,
  DoorOpen,
  Download,
  Droplet,
  Edit2,
  Edit3,
  ExternalLink,
  Eye,
  FileCheck,
  FileCheck2,
  FilePenLine,
  FileSignature,
  FileText,
  FileUp,
  Flame,
  FlaskConical,
  Folder,
  FolderClosed,
  FolderOpen,
  GitBranch,
  Globe,
  Grid,
  Grid2X2,
  GripVertical,
  Handshake,
  Heading1,
  Heart,
  HelpCircle,
  History,
  Image,
  Images,
  Inbox,
  Info,
  Italic,
  KeyRound,
  LampDesk,
  Languages,
  Laptop,
  Layers,
  Layers3,
  LayoutDashboard,
  LayoutGrid,
  LayoutTemplate,
  Link,
  Link2,
  List,
  ListMinus,
  ListPlus,
  ListTodo,
  Loader2,
  LoaderCircle,
  Lock,
  LockKeyhole,
  LogOut,
  Mail,
  MailPlus,
  MapPin,
  Maximize2,
  Megaphone,
  Menu,
  MessageCircle,
  MessageCircleMore,
  MessageSquare,
  MessageSquareText,
  Mic,
  MicOff,
  Minimize2,
  Minus,
  Monitor,
  Moon,
  MoreHorizontal,
  MoreVertical,
  MousePointerClick,
  Move,
  Music,
  NotebookPen,
  Package,
  PackageCheck,
  Palette,
  PanelBottom,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  PanelTop,
  Paperclip,
  PartyPopper,
  Pause,
  PenLine,
  PenSquare,
  Pencil,
  Phone,
  PhoneCall,
  PhoneIncoming,
  PhoneMissed,
  PhoneOff,
  PhoneOutgoing,
  Play,
  Plus,
  Printer,
  QrCode,
  Radar,
  Receipt,
  ReceiptText,
  RectangleHorizontal,
  Redo2,
  RefreshCw,
  Reply,
  RotateCcw,
  RotateCw,
  Ruler,
  Save,
  Search,
  Send,
  Settings,
  Settings2,
  Share2,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  SlidersHorizontal,
  Smartphone,
  Sofa,
  Space,
  Sparkles,
  SquarePen,
  Star,
  Sun,
  Tablet,
  Tag,
  Tags,
  ThumbsUp,
  Trash2,
  TrendingDown,
  TrendingUp,
  Type,
  Underline,
  Undo2,
  Unplug,
  Upload,
  User,
  UserCheck,
  UserPlus,
  UserRound,
  UserRoundCheck,
  UserX,
  Users,
  Utensils,
  Video,
  Voicemail,
  Volume2,
  VolumeX,
  WalletCards,
  Workflow,
  Wrench,
  X,
  XCircle,
  Zap,
  ZoomIn,
  ZoomOut,
}
