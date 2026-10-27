// Symbol und Farbe je Seite -- fuer "Mehr", die Seitenleiste und die Suche.
import {
  Sun, CalendarDays, Calendar, ListChecks, MessageCircle, Clapperboard, FolderOpen, Bookmark,
  Users, Target, CalendarRange, ReceiptEuro, Wallet, BarChart3, TrendingUp, UserRound, Mail,
  Settings, Trash2, Building2, ChevronRight, LayoutGrid, BookOpen, Megaphone,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export const SYMBOL: Record<string, LucideIcon> = {
  '/': Sun, '/plan': CalendarDays, '/kalender': Calendar, '/aufgaben': ListChecks, '/chat': MessageCircle,
  '/produktion': Clapperboard, '/medien': FolderOpen, '/lexikon': BookOpen, '/inspirationen': Bookmark,
  '/kunden': Users, '/leads': Target, '/brand': Megaphone,
  '/monate': CalendarRange, '/rechnungen': ReceiptEuro, '/finanzen': Wallet, '/firma': Building2,
  '/analyse': BarChart3, '/leistung': TrendingUp,
  '/team': UserRound, '/postfach': Mail,
  '/einstellungen': Settings, '/papierkorb': Trash2, '/mehr': LayoutGrid,
}

/** Farben wie in den iPhone-Einstellungen: ein Farbton je Bereich. */
export const FARBE: Record<string, string> = {
  '/': 'glut', '/plan': 'glut', '/kalender': 'rot', '/aufgaben': 'gelb', '/chat': 'gruen',
  '/produktion': 'lila', '/medien': 'blau', '/lexikon': 'gelb', '/inspirationen': 'pink',
  '/kunden': 'blau', '/leads': 'tuerkis', '/brand': 'pink',
  '/monate': 'gruen', '/rechnungen': 'gruen', '/finanzen': 'gruen', '/firma': 'gruen',
  '/analyse': 'lila', '/leistung': 'tuerkis',
  '/team': 'glut', '/postfach': 'blau',
  '/einstellungen': 'grau', '/papierkorb': 'grau',
}

export function symbolVon(pfad: string): LucideIcon { return SYMBOL[pfad] ?? ChevronRight }
export function farbeVon(pfad: string): string { return FARBE[pfad] ?? 'grau' }
