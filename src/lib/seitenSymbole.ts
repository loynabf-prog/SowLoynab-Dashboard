// Symbol und Farbe je Seite -- fuer "Mehr", die Seitenleiste und die Suche.
import {
  Sun, CalendarDays, Calendar, ListChecks, MessageCircle, Clapperboard, FolderOpen, Bookmark,
  Users, Target, CalendarRange, ReceiptEuro, Wallet, BarChart3, TrendingUp, UserRound, Mail,
  Settings, Trash2, ChevronRight, LayoutGrid,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export const SYMBOL: Record<string, LucideIcon> = {
  '/': Sun, '/plan': CalendarDays, '/kalender': Calendar, '/aufgaben': ListChecks, '/chat': MessageCircle,
  '/produktion': Clapperboard, '/medien': FolderOpen, '/inspirationen': Bookmark,
  '/kunden': Users, '/leads': Target,
  '/monate': CalendarRange, '/rechnungen': ReceiptEuro, '/finanzen': Wallet,
  '/analyse': BarChart3, '/leistung': TrendingUp,
  '/team': UserRound, '/postfach': Mail,
  '/einstellungen': Settings, '/papierkorb': Trash2, '/mehr': LayoutGrid,
}

/** Farben wie in den iPhone-Einstellungen: ein Farbton je Bereich. */
export const FARBE: Record<string, string> = {
  '/': 'glut', '/plan': 'glut', '/kalender': 'rot', '/aufgaben': 'gelb', '/chat': 'gruen',
  '/produktion': 'lila', '/medien': 'lila', '/inspirationen': 'lila',
  '/kunden': 'blau', '/leads': 'blau',
  '/monate': 'gruen', '/rechnungen': 'gruen', '/finanzen': 'gruen',
  '/analyse': 'blau', '/leistung': 'blau',
  '/team': 'glut', '/postfach': 'glut',
  '/einstellungen': 'grau', '/papierkorb': 'grau',
}

export function symbolVon(pfad: string): LucideIcon { return SYMBOL[pfad] ?? ChevronRight }
export function farbeVon(pfad: string): string { return FARBE[pfad] ?? 'grau' }
